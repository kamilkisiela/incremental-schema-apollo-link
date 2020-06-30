import { execute, toPromise, ApolloLink, GraphQLRequest } from "apollo-link";
import { parse } from "graphql";
import { makeExecutableSchema } from "@graphql-tools/schema";
import {
  createIncrementalSchemaLink,
  SchemaModuleMap,
} from "../src";

const schemaModuleMap: SchemaModuleMap = {
  modules: [() => import("./fixtures/calendar"), () => import("./fixtures/chats")],
  sharedModule: () => import("./fixtures/shared"),
  Query: {
    events: 0,
    chats: 1,
  },
  Mutation: {
    addEvent: 0,
  },
  Subscription: {},
};

function executeLink(link: ApolloLink, operation: GraphQLRequest) {
  return toPromise(execute(link, operation));
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
    schemaBuilder: makeExecutableSchema,
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
    schemaBuilder: makeExecutableSchema,
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
    schemaBuilder: makeExecutableSchema,
  });
  const result = await executeLink(link, {
    query: parse(/* GraphQL */ `
      {
        ping
      }
    `),
  });

  expect(result.data!.ping).toBe('pong');

  expect(sharedSpy).toBeCalledTimes(1);
  expect(chatsSpy).not.toBeCalled();
  expect(calendarSpy).not.toBeCalled();
});

test("memoize the result of schema building over time", async () => {
  const buildSpy = jest.fn(makeExecutableSchema);
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
