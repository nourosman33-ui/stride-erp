import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";

function buildContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  it("allows access when the route requires no roles", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext({ roles: [] }))).toBe(true);
  });

  it("allows access when the user has one of the required roles", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["owner", "manager"]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext({ roles: ["manager"] }))).toBe(true);
  });

  it("rejects access when the user lacks all required roles", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["owner"]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(buildContext({ roles: ["cashier"] }))).toThrow(
      ForbiddenException,
    );
  });

  it("rejects access when there is no authenticated user", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["owner"]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });
});
