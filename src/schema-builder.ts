import { DocumentNode, GraphQLSchema, buildASTSchema } from "graphql";

export function schemaBuilder({
  typeDefs,
  resolvers,
}: {
  typeDefs: DocumentNode;
  resolvers: any[];
}): GraphQLSchema {
  const schema = buildASTSchema(typeDefs);

  addResolversToSchema(resolvers, schema);

  return schema;
}

function addResolver(
  schema: GraphQLSchema,
  typeName: string,
  fieldName: string | undefined,
  resolver: Function | Object
) {
  const type = schema.getType(typeName);
  if (!type) {
    throw new Error(`Type ${typeName} is missing`);
  }

  if (!fieldName) {
    (type as any).resolve = resolver;
  } else if (fieldName.startsWith("__")) {
    const method = fieldName.replace("__", "");
    (type as any)[method] = resolver;
  } else {
    const field = (type as any).getFields()[fieldName];

    if (!field) {
      throw new Error(`${typeName}.${fieldName} is missing`);
    }

    field.resolve = resolver;
  }
}

function addResolversToSchema(resolvers: any, schema: GraphQLSchema) {
  if (Array.isArray(resolvers)) {
    resolvers.forEach((r) => {
      addResolversToSchema(r, schema);
    });
  } else if (!!resolvers && typeof resolvers === "object") {
    for (const typeName in resolvers) {
      const fields = resolvers[typeName];

      if (typeof fields === "function") {
        // scalar
        addResolver(schema, typeName, undefined, fields);
      } else {
        for (const fieldName in fields) {
          addResolver(schema, typeName, fieldName, fields[fieldName]);
        }
      }
    }
  }
}
