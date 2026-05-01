import { Controller, Get, Param } from '@nestjs/common';
import { PriceFeedService } from './price-feed.service';
import { AssetClass } from '../../common/enums';
import { ok } from '../../common/helpers/response.helper';
import type { IApiResponse } from '../../common/dtos/response.dto';

interface PriceTickResponseDto {
  asset: AssetClass;
  pricePerUnit: string;
  currency: string;
  deltaBps: number;
  updatedAt: string;
}

@Controller('prices')
export class PriceFeedController {
  constructor(private readonly feed: PriceFeedService) {}

  @Get()
  getAll(): IApiResponse<PriceTickResponseDto[]> {
    return ok(this.feed.getAll().map(this.toDto), 'Prices retrieved');
  }

  @Get(':asset')
  getOne(
    @Param('asset') asset: AssetClass,
  ): IApiResponse<PriceTickResponseDto> {
    return ok(this.toDto(this.feed.get(asset)), 'Price retrieved');
  }

  private toDto = (t: {
    asset: AssetClass;
    pricePerUnit: {
      toMajorUnit(): { amount: string | bigint; currency: string };
    };
    deltaBps: number;
    updatedAt: Date;
  }): PriceTickResponseDto => {
    const major = t.pricePerUnit.toMajorUnit();
    return {
      asset: t.asset,
      pricePerUnit: String(major.amount),
      currency: major.currency,
      deltaBps: t.deltaBps,
      updatedAt: t.updatedAt.toISOString(),
    };
  };
}
