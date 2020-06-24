import { parse } from "graphql";

const events = [
  { id: 0, name: "Shopping", description: "Gifts" },
  { id: 1, name: "Vet", description: "Dog is sick" },
  { id: 2, name: "Party", description: "After months of Covid-19" },
];

export const typeDefs = parse(/* GraphQL */ `
  extend type Query {
    events: [Event!]
  }

  extend type Mutation {
    addEvent(name: String!, description: String): Event!
  }

  type Event {
    id: ID!
    name: String!
    description: String
  }
`);

export const resolvers = {
  Query: {
    events() {
      return events;
    },
  },
  Mutation: {
    addEvent(_: never, { name, description }: any) {
      const event = {
        id: events.length,
        name,
        description,
      };

      events.push(event);

      return event;
    },
  },
};
