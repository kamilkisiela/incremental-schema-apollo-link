# Apollo Link for Incremental Schema concept

This Link is super helpful only if you execute GraphQL operations on the client-side. It enables you to lazy-load chunks of schema incrementally to reduce the bundle size.

## Setup

Install:

    npm install incremental-schema-apollo-link

```typescript
const map = {
  modules: [
    () => import("./modules/calendar"),
    () => import("./modules/chats"),
    () => import("./modules/blog"),
  ],
  //
  // Create dependencies between modules
  //    dependencies: {
  //      0: [1],
  //      1: [0, 2],
  //    },
  //
  sharedModule: () => import("./modules/shared"),
  types: {
    Query: {
      events: 0,
      chats: 1,
      posts: 2,
    },
    Mutation: {
      addEvent: 0,
    },
    Subscription: {},
  },
  //
  // Allow force pre-loading certain modules on first query
  //   preloadModules: [0, 1]
};

const link = createIncrementalSchemaLink({
  map,
  //
  // Accepts initial resolvers, independent from modules
  //    resolvers: {}, - see src/index.ts
  //
  // Suppports context building
  //    contextBuilder() {}, - see src/index.ts
  //
  // Allows to define root types
  //    schemaDefinition: {} - see src/index.ts
  //
  // Comes with built-in schema builder but you can define your own
  //    schemaBuilder({ typeDefs, resolvers }) {
  //      return makeExecutableSchema({ typeDefs, resolvers });
  //    },
  //
});
```

Connect it with Apollo Client and you're good to go!

## Usage

Take a look at the example below. We call a GraphQL operation to query events.

```javascript
function Component() {
  useQuery(gql`
    {
      events {
        id
        name
      }
    }
  `);

  // ...
}
```

Initially, before the component gets mounted, no schema is loaded and the schema modules are not included in the initial bundle. You save up kilobytes.

After component is mounted, the Incremental Schema Link receives an operation and sees that you asked for `Query.events` which belongs to calendar module (index `0` in modules list). It collects dependencies and dynamically imports everything, builds a schema (memoizes it) and executes the operation. Now your component receives the data.

Everything happens on demand.

## Tooling

[We](https://the-guild.dev) don't write the map by hand, it's auto-generated based on our schema. If you're interested in tooling, please reach out to us!
