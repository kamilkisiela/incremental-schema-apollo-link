import { ApolloLink, fromPromise } from "apollo-link";
import {
  OperationDefinitionNode,
  DefinitionNode,
  ExecutionArgs,
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
type ContextBuilder<TContext = {}> = (modules: SchemaModule<TContext>[]) => any;

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
  modules: SchemaModuleLoader[];
  sharedModule: SchemaModuleLoader;
  Query: Record<string, number>;
  Mutation: Record<string, number>;
  Subscription: Record<string, number>;
};

export type IncrementalSchemaLinkOptions<TContext = {}> = {
  map: SchemaModuleMap;
  schemaBuilder(input: {
    typeDefs: DocumentNode;
    resolvers: any[];
  }): GraphQLSchema;
  contextBuilder?: ContextBuilder<TContext>;
};

/**
 * Creates an ApolloLink that lazy-loads parts of schema, with resolvers and context.
 */
export function createIncrementalSchemaLink({
  map,
  schemaBuilder,
  contextBuilder,
}: IncrementalSchemaLinkOptions) {
  const manager = SchemaModulesManager({ map, schemaBuilder, contextBuilder });

  return new ApolloLink((op) =>
    fromPromise(
      manager.execute({
        document: op.query,
        variableValues: op.variables,
        operationName: op.operationName,
      })
    )
  );
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
      .map((field) => map[operationKind][field])
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

  return {
    async execute({
      document,
      variableValues,
      operationName,
    }: Pick<
      ExecutionArgs,
      "document" | "variableValues" | "operationName"
    >): Promise<ExecutionResult> {
      const modules = collectRequiredModules(document);
      const modulesToLoad = modules.filter((mod) => !usedModules.includes(mod));
      const allModules = modulesToLoad.concat(usedModules);

      return execute({
        schema: await buildSchema(allModules),
        document,
        variableValues,
        operationName,
        contextValue: contextBuilder
          ? contextBuilder(await loadModules(allModules))
          : {},
      });
    },
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
