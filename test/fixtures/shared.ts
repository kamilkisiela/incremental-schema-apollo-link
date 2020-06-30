import { parse } from "graphql";

export const typeDefs = parse(/* GraphQL */ `
  type Query {
    _: String
    ping: String!
  }

  type Mutation {
    _: String
  }

  type User {
    id: ID!
    name: String!
  }
`);

const users = ["Foo", "Bar"];

export const resolvers = {
  Query: {
    ping() {
      return "pong";
    },
  },
  User: {
    id(id: number) {
      return id;
    },
    name(id: number) {
      return users[id];
    },
  },
};
