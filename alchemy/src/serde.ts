import { decryptWithKey, encrypt } from "./encrypt.js";
import { Scope } from "./scope.js";
import { Secret } from "./secret.js";

import type { Type } from "arktype";

// zero-dependency type guard for ArkType
function isType(value: any): value is Type<any, any> {
  return (
    value &&
    typeof value === "object" &&
    typeof value.toJsonSchema === "function"
  );
}

export async function serialize(
  scope: Scope,
  value: any,
  options?: {
    encrypt?: boolean;
  }
): Promise<any> {
  if (Array.isArray(value)) {
    return Promise.all(value.map((value) => serialize(scope, value, options)));
  } else if (value instanceof Secret) {
    if (!scope.password) {
      throw new Error("Cannot serialize secret without password");
    }
    return {
      "@secret":
        options?.encrypt !== false
          ? await encrypt(value.unencrypted, scope.password)
          : value.unencrypted,
    };
  } else if (isType(value)) {
    return {
      "@schema": value.toJSON(),
    };
  } else if (value instanceof Date) {
    return {
      "@date": value.toISOString(),
    };
  } else if (value instanceof Scope) {
    return undefined;
  } else if (value && typeof value === "object") {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([key, value]) => [
          key,
          await serialize(scope, value, options),
        ])
      )
    );
  }
  return value;
}

export async function deserialize(scope: Scope, value: any): Promise<any> {
  if (Array.isArray(value)) {
    return await Promise.all(
      value.map(async (item) => await deserialize(scope, item))
    );
  } else if (value && typeof value === "object") {
    if (typeof value["@secret"] === "string") {
      if (!scope.password) {
        throw new Error("Cannot deserialize secret without password");
      }
      return new Secret(await decryptWithKey(value["@secret"], scope.password));
    } else if ("@schema" in value) {
      return value["@schema"];
    } else if ("@date" in value) {
      return new Date(value["@date"]);
    } else {
      return Object.fromEntries(
        await Promise.all(
          Object.entries(value).map(async ([key, value]) => [
            key,
            await deserialize(scope, value),
          ])
        )
      );
    }
  }
  return value;
}
