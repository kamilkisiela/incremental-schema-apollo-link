import type { Operation } from "@apollo/client/link/core";
import type {
  OperationDefinitionNode,
  OperationTypeNode,
  DefinitionNode,
  DocumentNode,
  FieldNode,
  GraphQLSchema,
} from "graphql";
import { setContext } from "@apollo/client/link/context";
import { Kind, concatAST } from "graphql";

export { schemaBuilder } from "./schema-builder";

type OperationType = SchemaDefinition[OperationTypeNode];
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

interface Dependencies {
  [moduleIndex: string]: number[] | undefined;
}

type SchemaModuleMapInternal = {
  modules?: SchemaModuleLoader[];
  dependencies?: Dependencies;
  sharedModule: SchemaModuleLoader;
  types: {
    [typeName: string]: Record<string, number>;
  };
};

type Exact<T> = {
  [P in keyof T]: T[P];
};

/**
 * A map between fields of Queries, Mutations or Subscriptions and Schema Modules
 */
export type SchemaModuleMap = Exact<SchemaModuleMapInternal>;

interface SchemaDefinition {
  query: string;
  mutation: string;
  subscription: string;
}

export type IncrementalSchemaLinkOptions<TContext = {}> = {
  map: SchemaModuleMap;
  schemaBuilder(input: {
    typeDefs: DocumentNode;
    resolvers: any[];
  }): GraphQLSchema;
  contextBuilder?: ContextBuilder<TContext>;
  schemaDefinition?: SchemaDefinition;
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
  schemaDefinition = {
    query: "Query",
    mutation: "Mutation",
    subscription: "Subscription",
  },
}: IncrementalSchemaLinkOptions<TContext>) {
  if (
    Object.values(schemaDefinition).length !== 3 ||
    Object.keys(schemaDefinition).filter(
      (key) => ["query", "mutation", "subscription"].includes(key) === false
    ).length !== 0
  ) {
    throw new Error(
      `"options.schemaDefinition" requires all 3 root types to be defined`
    );
  }

  const manager = SchemaModulesManager({
    map,
    schemaBuilder,
    contextBuilder,
    schemaDefinition,
  });

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

function listDependencies(startAt: number[], map: SchemaModuleMap): number[] {
  if (!map.dependencies) {
    return startAt;
  }

  const visited: number[] = [];
  const maxId = map.modules?.length || 0;

  function visit(i: number | string) {
    const id = typeof i === "string" ? parseInt(i, 10) : i;

    if (id < 0 || id >= maxId) {
      return;
    }

    if (visited.indexOf(id) === -1) {
      visited.push(id);

      if (map.dependencies[id]?.length) {
        map.dependencies[id].forEach(visit);
      }
    }
  }

  startAt.forEach(visit);

  return visited;
}

/**
 * Manages Schema Module, orchestrates the lazy-loading, deals with schema building etc
 */
function SchemaModulesManager({
  map,
  schemaBuilder,
  contextBuilder,
  schemaDefinition,
}: IncrementalSchemaLinkOptions) {
  let usedModules: number[] = [];

  /**
   * Collects a list of required modules (based on root-level fields)
   * and a kind of an operation (Q, M or S)
   */
  function collectRequiredModules(doc: DocumentNode): number[] {
    const [rootFields, operationKind] = findRootFieldsAndKind(
      doc,
      schemaDefinition
    );

    return listDependencies(
      rootFields
        .map((field) => map.types[operationKind]?.[field])
        .filter(onlyDefined)
        .filter(onlyUnique),
      map
    );
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
    prepare,
  };
}

function findRootFieldsAndKind(
  doc: DocumentNode,
  schemaDefinition: SchemaDefinition
): [string[], OperationType] {
  const op = doc.definitions.find(isOperationNode)!;

  const rootFields = op.selectionSet.selections.map(
    (field) => (field as FieldNode).name.value
  );

  return [rootFields, schemaDefinition[op.operation]];
}

function isOperationNode(def: DefinitionNode): def is OperationDefinitionNode {
  return def.kind === Kind.OPERATION_DEFINITION;
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
