import { ApolloLink, Operation } from "@apollo/client/link/core";
import { fromPromise } from "@apollo/client/link/utils";
import { setContext } from "@apollo/client/link/context";
import {
  OperationDefinitionNode,
  DefinitionNode,
  DocumentNode,
  FieldNode,
  execute,
  Kind,
  ExecutionResult,
  GraphQLSchema,
  OperationTypeNode,
  concatAST,
} from "graphql";

type OperationType = "Query" | "Mutation" | "Subscription";
type ContextBuilder<TContext = {}> = (input: {
  modules: SchemaModule<TContext>[];
  operation: Operation;
}) => any;

/**
 * Represents the exported keywords of a module
 */
type SchemaModule<TContext = {}> = {
  typeDefs: DocumentNode;
  resolvers?: {};
  context?(ctx: TContext): any;
};
/**
 * A function that loads a module
 */
type SchemaModuleLoader = () => Promise<SchemaModule>;
/**
 * A map between fields of Queries, Mutations or Subscriptions and Schema Modules
 */
export type SchemaModuleMap = {
  modules?: SchemaModuleLoader[];
  sharedModule: SchemaModuleLoader;
  Query?: Record<string, number>;
  Mutation?: Record<string, number>;
  Subscription?: Record<string, number>;
};

export type IncrementalSchemaLinkOptions<TContext = {}> = {
  map: SchemaModuleMap;
  schemaBuilder(input: {
    typeDefs: DocumentNode;
    resolvers: any[];
  }): GraphQLSchema;
  contextBuilder?: ContextBuilder<TContext>;
  terminating?: boolean;
};

export type WithIncremental<T extends {}> = T & {
  incremental: {
    schema: GraphQLSchema;
    contextValue: any;
  };
};

/**
 * Creates an ApolloLink that lazy-loads parts of schema, with resolvers and context.
 */
export function createIncrementalSchemaLink<TContext = {}>({
  map,
  schemaBuilder,
  contextBuilder,
  terminating = true,
}: IncrementalSchemaLinkOptions<TContext>) {
  const manager = SchemaModulesManager({ map, schemaBuilder, contextBuilder });

  if (terminating) {
    return new ApolloLink((op) => fromPromise(manager.execute(op)));
  }

  return setContext(async (op, prev) => {
    const { schema, contextValue } = await manager.prepare(op as any);

    return {
      ...prev,
      incremental: {
        schema,
        contextValue,
      },
    };
  });
}

/**
 * Manages Schema Module, orchestrates the lazy-loading, deals with schema building etc
 */
function SchemaModulesManager({
  map,
  schemaBuilder,
  contextBuilder,
}: IncrementalSchemaLinkOptions) {
  let usedModules: number[] = [];

  /**
   * Collects a list of required modules (based on root-level fields)
   * and a kind of an operation (Q, M or S)
   */
  function collectRequiredModules(doc: DocumentNode): number[] {
    const [rootFields, operationKind] = findRootFieldsAndKind(doc);

    return rootFields
      .map((field) => map[operationKind]?.[field])
      .filter(onlyDefined)
      .filter(onlyUnique);
  }

  /**
   * Loads all requested modules by their id + shared module
   */
  async function loadModules(ids: number[]) {
    const mods = await Promise.all(ids.map((mod) => map.modules[mod]()));
    const shared = await map.sharedModule();

    return mods.concat([shared]);
  }

  /**
   * Builds GraphQLSchema object based on a list of module ids
   * Does the memoization internally to avoid unnecessary computations
   */
  async function _buildSchema(ids: number[]) {
    const modules = await loadModules(ids);

    // saves a list of used modules including those requested by operation
    usedModules = usedModules.concat(ids).filter(onlyUnique);

    const schema = schemaBuilder({
      typeDefs: concatAST(modules.map((m) => m.typeDefs)),
      resolvers: modules.map((m) => m.resolvers || {}),
    });

    return schema;
  }

  function hash(list: number[]) {
    return list.slice().sort().join("-");
  }

  function compare(currentHash: string, memoHash: string) {
    return memoHash === currentHash;
  }

  const buildSchema = memo(_buildSchema, hash, compare);

  async function prepare(
    operation: Operation
  ): Promise<{
    schema: GraphQLSchema;
    contextValue: any;
  }> {
    const modules = collectRequiredModules(operation.query);
    const modulesToLoad = modules.filter((mod) => !usedModules.includes(mod));
    const allModules = modulesToLoad.concat(usedModules);

    return {
      schema: await buildSchema(allModules),
      contextValue: contextBuilder
        ? contextBuilder({
            modules: await loadModules(allModules),
            operation,
          })
        : {},
    };
  }

  return {
    async execute(operation: Operation): Promise<ExecutionResult> {
      const { schema, contextValue } = await prepare(operation);

      return execute({
        schema,
        document: operation.query,
        variableValues: operation.variables,
        operationName: operation.operationName,
        contextValue,
      });
    },
    prepare,
  };
}

function findRootFieldsAndKind(doc: DocumentNode): [string[], OperationType] {
  const op = doc.definitions.find(isOperationNode)!;

  const rootFields = op.selectionSet.selections.map(
    (field) => (field as FieldNode).name.value
  );

  return [rootFields, capitalizeFirst(op.operation)];
}

function isOperationNode(def: DefinitionNode): def is OperationDefinitionNode {
  return def.kind === Kind.OPERATION_DEFINITION;
}

function capitalizeFirst(str: OperationTypeNode): OperationType {
  return (str.charAt(0).toUpperCase() + str.slice(1)) as OperationType;
}

function onlyUnique<T>(val: T, i: number, list: T[]) {
  return list.indexOf(val) === i;
}

function memo<A, R, H>(
  fn: (input: A) => R,
  hash: (input: A) => H,
  compare: (current: H, previous: H) => boolean
) {
  let memoizedResult: R;
  let memoizedInput: H;

  return (input: A): R => {
    const currentHash = hash(input);
    if (compare(currentHash, memoizedInput)) {
      return memoizedResult;
    }

    memoizedResult = fn(input);
    memoizedInput = currentHash;

    return memoizedResult;
  };
}

function onlyDefined<T>(val: T | undefined): val is T {
  return typeof val !== "undefined";
}
