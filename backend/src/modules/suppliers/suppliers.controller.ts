import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { SuppliersService } from "./suppliers.service";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { LinkProductSupplierDto } from "./dto/link-product.dto";
import { RecordSupplierPaymentDto } from "./dto/record-payment.dto";

@Controller("suppliers")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @Roles("owner", "manager")
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Get()
  findAll() {
    return this.suppliersService.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.suppliersService.findOne(id);
  }

  @Post(":id/products")
  @Roles("owner", "manager")
  linkProduct(@Param("id") id: string, @Body() dto: LinkProductSupplierDto) {
    return this.suppliersService.linkProduct(id, dto);
  }

  @Get(":id/products")
  listLinkedProducts(@Param("id") id: string) {
    return this.suppliersService.listLinkedProducts(id);
  }

  @Post(":id/payments")
  @Roles("owner", "manager", "accountant")
  recordPayment(@Param("id") id: string, @Body() dto: RecordSupplierPaymentDto) {
    return this.suppliersService.recordPayment(id, dto);
  }

  @Get(":id/ledger")
  getLedger(@Param("id") id: string) {
    return this.suppliersService.getLedger(id);
  }
}
