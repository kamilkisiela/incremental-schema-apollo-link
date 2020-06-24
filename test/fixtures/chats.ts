import { parse } from "graphql";

export const typeDefs = parse(/* GraphQL */ `
  extend type Query {
    chats: [Chat!]
  }

  type Chat {
    id: ID!
    title: String!
    members: [User!]
  }
`);

export const resolvers = {
  Query: {
    chats() {
      return [
        { id: 0, title: "Apollo", members: [0] },
        { id: 1, title: "EngSys", members: [0] },
        { id: 2, title: "General", members: [0, 1] },
      ];
    },
  },
};
