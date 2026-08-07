import { SalesController } from "./sales.controller";

function buildService() {
  return {
    checkout: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
  };
}

describe("SalesController", () => {
  it("delegates checkout to SalesService with the authenticated cashier's id", () => {
    const service = buildService();
    const controller = new SalesController(service as any);
    const dto = { storeId: "store-1", lines: [], payments: [] } as any;

    controller.checkout(dto, { userId: "user-1", email: "a@b.com", roles: ["cashier"] });

    expect(service.checkout).toHaveBeenCalledWith(dto, "user-1");
  });

  it("delegates findAll with the optional storeId filter", () => {
    const service = buildService();
    const controller = new SalesController(service as any);

    controller.findAll("store-1");

    expect(service.findAll).toHaveBeenCalledWith("store-1");
  });

  it("delegates findOne by id", () => {
    const service = buildService();
    const controller = new SalesController(service as any);

    controller.findOne("order-1");

    expect(service.findOne).toHaveBeenCalledWith("order-1");
  });
});
