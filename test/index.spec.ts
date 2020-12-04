import {
  execute as executeApolloLink,
  ApolloLink,
  GraphQLRequest,
  Operation,
} from "@apollo/client/link/core";
import { toPromise, fromPromise } from "@apollo/client/link/utils";
import { parse, execute, ExecutionResult } from "graphql";
import { schemaBuilder } from "../src/schema-builder";
import { createIncrementalSchemaLink, SchemaModuleMap } from "../src";

async function executeOperation(
  operation: Operation
): Promise<ExecutionResult> {
  const { schema, contextValue } = operation.getContext().incremental;

  return execute({
    schema,
    document: operation.query,
    variableValues: operation.variables,
    operationName: operation.operationName,
    contextValue,
  });
}

const terminatingLink = new ApolloLink((operation) =>
  fromPromise(executeOperation(operation))
);

const schemaModuleMap: SchemaModuleMap = {
  modules: [
    () => import("./fixtures/calendar"),
    () => import("./fixtures/chats"),
  ],
  sharedModule: () => import("./fixtures/shared"),
  types: {
    Query: {
      events: 0,
      chats: 1,
    },
    Mutation: {
      addEvent: 0,
    },
    Subscription: {},
  },
};

function executeLink(link: ApolloLink, operation: GraphQLRequest) {
  return toPromise(
    executeApolloLink(ApolloLink.from([link, terminatingLink]), operation)
  );
}

beforeEach(() => {
  jest.restoreAllMocks();
});

test("load shared module + a used module", async () => {
  const sharedSpy = jest.spyOn(schemaModuleMap, "sharedModule");
  const chatsSpy = jest.fn(schemaModuleMap.modules[1]);
  const calendarSpy = jest.fn(schemaModuleMap.modules[0]);
  const link = createIncrementalSchemaLink({
    map: {
      ...schemaModuleMap,
      modules: [calendarSpy, chatsSpy],
    },
    schemaBuilder: schemaBuilder,
  });
  const result = await executeLink(link, {
    query: parse(/* GraphQL */ `
      {
        chats {
          id
        }
      }
    `),
  });

  expect(result.data!.chats).toBeDefined();

  expect(sharedSpy).toBeCalledTimes(1);
  expect(chatsSpy).toBeCalledTimes(1);
  expect(calendarSpy).not.toBeCalled();
});

test("load shared module + multiple requested modules", async () => {
  const sharedSpy = jest.spyOn(schemaModuleMap, "sharedModule");
  const chatsSpy = jest.fn(schemaModuleMap.modules[1]);
  const calendarSpy = jest.fn(schemaModuleMap.modules[0]);
  const link = createIncrementalSchemaLink({
    map: {
      ...schemaModuleMap,
      modules: [calendarSpy, chatsSpy],
    },
    schemaBuilder: schemaBuilder,
  });
  const result = await executeLink(link, {
    query: parse(/* GraphQL */ `
      {
        chats {
          id
        }
        events {
          id
        }
      }
    `),
  });

  expect(result.data!.chats).toBeDefined();
  expect(result.data!.events).toBeDefined();

  expect(sharedSpy).toBeCalledTimes(1);
  expect(chatsSpy).toBeCalledTimes(1);
  expect(calendarSpy).toBeCalledTimes(1);
});

test("load shared module only", async () => {
  const sharedSpy = jest.spyOn(schemaModuleMap, "sharedModule");
  const chatsSpy = jest.fn(schemaModuleMap.modules[1]);
  const calendarSpy = jest.fn(schemaModuleMap.modules[0]);
  const link = createIncrementalSchemaLink({
    map: {
      ...schemaModuleMap,
      modules: [calendarSpy, chatsSpy],
    },
    schemaBuilder: schemaBuilder,
  });
  const result = await executeLink(link, {
    query: parse(/* GraphQL */ `
      {
        ping
      }
    `),
  });

  expect(result.data!.ping).toBe("pong");

  expect(sharedSpy).toBeCalledTimes(1);
  expect(chatsSpy).not.toBeCalled();
  expect(calendarSpy).not.toBeCalled();
});

test("load a module with its dependencies", async () => {
  const map: SchemaModuleMap = {
    modules: [
      () => import("./fixtures/calendar"),
      () => import("./fixtures/chats"),
    ],
    dependencies: {
      0: [1],
    },
    sharedModule: () => import("./fixtures/shared"),
    types: {
      Query: {
        events: 0,
        chats: 1,
      },
      Mutation: {
        addEvent: 0,
      },
      Subscription: {},
    },
  };
  const sharedSpy = jest.spyOn(map, "sharedModule");
  const chatsSpy = jest.fn(map.modules[1]);
  const calendarSpy = jest.fn(map.modules[0]);
  const link = createIncrementalSchemaLink({
    map: {
      ...map,
      modules: [calendarSpy, chatsSpy],
    },
    schemaBuilder: schemaBuilder,
  });
  const result = await executeLink(link, {
    query: parse(/* GraphQL */ `
      {
        events {
          id
        }
      }
    `),
  });

  expect(result.data!.events).toBeDefined();

  expect(sharedSpy).toBeCalledTimes(1);
  expect(chatsSpy).toBeCalledTimes(1);
  expect(calendarSpy).toBeCalledTimes(1);
});

test("load a module with its dependencies (including circular dependency)", async () => {
  const map: SchemaModuleMap = {
    modules: [
      () => import("./fixtures/calendar"),
      () => import("./fixtures/chats"),
    ],
    dependencies: {
      0: [1],
      1: [0],
    },
    sharedModule: () => import("./fixtures/shared"),
    types: {
      Query: {
        events: 0,
        chats: 1,
      },
      Mutation: {
        addEvent: 0,
      },
      Subscription: {},
    },
  };
  const sharedSpy = jest.spyOn(map, "sharedModule");
  const chatsSpy = jest.fn(map.modules[1]);
  const calendarSpy = jest.fn(map.modules[0]);
  const link = createIncrementalSchemaLink({
    map: {
      ...map,
      modules: [calendarSpy, chatsSpy],
    },
    schemaBuilder: schemaBuilder,
  });
  const result = await executeLink(link, {
    query: parse(/* GraphQL */ `
      {
        events {
          id
        }
      }
    `),
  });

  expect(result.data!.events).toBeDefined();

  expect(sharedSpy).toBeCalledTimes(1);
  expect(chatsSpy).toBeCalledTimes(1);
  expect(calendarSpy).toBeCalledTimes(1);
});

test("load a module without a non-existing dependency (incorrect index)", async () => {
  const map: SchemaModuleMap = {
    modules: [
      () => import("./fixtures/calendar"),
      () => import("./fixtures/chats"),
    ],
    dependencies: {
      0: [2], // incorrect index
    },
    sharedModule: () => import("./fixtures/shared"),
    types: {
      Query: {
        events: 0,
        chats: 1,
      },
      Mutation: {
        addEvent: 0,
      },
      Subscription: {},
    },
  };
  const sharedSpy = jest.spyOn(map, "sharedModule");
  const chatsSpy = jest.fn(map.modules[1]);
  const calendarSpy = jest.fn(map.modules[0]);
  const link = createIncrementalSchemaLink({
    map: {
      ...map,
      modules: [calendarSpy, chatsSpy],
    },
    schemaBuilder: schemaBuilder,
  });
  const result = await executeLink(link, {
    query: parse(/* GraphQL */ `
      {
        events {
          id
        }
      }
    `),
  });

  expect(result.data!.events).toBeDefined();

  expect(sharedSpy).toBeCalledTimes(1);
  expect(calendarSpy).toBeCalledTimes(1);
  expect(chatsSpy).toBeCalledTimes(0);
});

test("accept non-default schema definition (root types)", async () => {
  const map: SchemaModuleMap = {
    modules: [
      async () => ({
        typeDefs: parse(/* GraphQL */ `
          extend type RootQuery {
            chats: [Int!]
          }
        `),
        resolvers: {
          RootQuery: {
            chats() {
              return [0, 1, 2];
            },
          },
        },
      }),
    ],
    sharedModule: async () => ({
      typeDefs: parse(/* GraphQL */ `
        type RootQuery {
          ping: String
        }

        schema {
          query: RootQuery
        }
      `),
    }),
    types: {
      RootQuery: {
        chats: 0,
      },
    },
  };
  const sharedSpy = jest.spyOn(map, "sharedModule");
  const chatsSpy = jest.fn(map.modules[0]);
  const link = createIncrementalSchemaLink({
    map: {
      ...map,
      modules: [chatsSpy],
    },
    schemaDefinition: {
      query: "RootQuery",
      mutation: "RootMutation",
      subscription: "RootSubscription",
    },
    schemaBuilder: schemaBuilder,
  });
  const result = await executeLink(link, {
    query: parse(/* GraphQL */ `
      {
        chats {
          id
        }
      }
    `),
  });

  expect(result.data!.chats).toBeDefined();

  expect(sharedSpy).toBeCalledTimes(1);
  expect(chatsSpy).toBeCalledTimes(1);
});

test("memoize the result of schema building over time", async () => {
  const buildSpy = jest.fn(schemaBuilder);
  const link = createIncrementalSchemaLink({
    map: schemaModuleMap,
    schemaBuilder: buildSpy,
  });

  await executeLink(link, {
    query: parse(/* GraphQL */ `
      {
        chats {
          id
        }
      }
    `),
  });

  await executeLink(link, {
    query: parse(/* GraphQL */ `
      {
        chats {
          id
        }
      }
    `),
  });

  expect(buildSpy).toBeCalledTimes(1);

  await executeLink(link, {
    query: parse(/* GraphQL */ `
      {
        events {
          id
        }
      }
    `),
  });

  expect(buildSpy).toBeCalledTimes(2);

  await executeLink(link, {
    query: parse(/* GraphQL */ `
      {
        chats {
          id
        }
      }
    `),
  });

  await executeLink(link, {
    query: parse(/* GraphQL */ `
      {
        events {
          id
        }
      }
    `),
  });

  await executeLink(link, {
    query: parse(/* GraphQL */ `
      {
        chats {
          id
          title
        }
      }
    `),
  });

  expect(buildSpy).toBeCalledTimes(2);
});
