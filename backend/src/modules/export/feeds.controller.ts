import { Controller, Get, Header, Param, Query } from "@nestjs/common";
import { FeedsService } from "./feeds.service";

/**
 * Deliberately NOT behind JwtAuthGuard: Excel's Data → From Web cannot attach an
 * Authorization header, so the URL path token is the credential (see the FeedToken model
 * comment for why that trade-off is acceptable and how it is contained).
 *
 * Every route is read-only and scoped to the single store the token belongs to —
 * the token never carries a user identity or any write capability. `noindex` and
 * `no-store` stop the numbers being cached or crawled if a link ever escapes.
 */
@Controller("feeds")
export class FeedsController {
  constructor(private readonly feeds: FeedsService) {}

  @Get(":token/financials")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  @Header("X-Robots-Tag", "noindex, nofollow")
  async financials(@Param("token") token: string) {
    const { storeId } = await this.feeds.resolveToken(token);
    return this.feeds.financialsFeed(storeId);
  }

  @Get(":token/forecast")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  @Header("X-Robots-Tag", "noindex, nofollow")
  async forecast(@Param("token") token: string, @Query("horizonMonths") horizon?: string) {
    const { storeId } = await this.feeds.resolveToken(token);
    return this.feeds.forecastFeed(storeId, Number(horizon) || 6);
  }

  @Get(":token/sales")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  @Header("X-Robots-Tag", "noindex, nofollow")
  async sales(@Param("token") token: string) {
    const { storeId } = await this.feeds.resolveToken(token);
    return this.feeds.salesFeed(storeId);
  }

  @Get(":token/stock")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  @Header("X-Robots-Tag", "noindex, nofollow")
  async stock(@Param("token") token: string) {
    const { storeId } = await this.feeds.resolveToken(token);
    return this.feeds.stockFeed(storeId);
  }
}
