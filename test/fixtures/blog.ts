import { parse } from "graphql";

export const typeDefs = parse(/* GraphQL */ `
  extend type Query {
    posts: [Post!]
  }

  type Post {
    id: ID!
    title: String!
  }
`);

export const resolvers = {
  Query: {
    posts() {
      return [
        { id: 0, title: "Covid-19" },
        { id: 1, title: "Lockdown" },
        { id: 2, title: "Vaccine" },
      ];
    },
  },
};
