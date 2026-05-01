import { Controller, Sse, Query, ParseUUIDPipe, Req } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { RealtimeService } from './realtime.service';
import type { SseChannel } from './dtos/sse-envelope.dto';

/**
 * SSE endpoints for real-time frontend updates.
 *
 * - `GET /sse/stream?userId={uuid}` — all channels (transactions, wallet, ai-insights, prices)
 * - `GET /sse/wallet?userId={uuid}` — wallet channel only
 * - `GET /sse/prices`               — global price feed (no auth)
 */
@Controller('sse')
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  /**
   * Multiplexed stream — subscribes the user to all channels.
   * @param userId - UUID of the authenticated user.
   * @returns An open `text/event-stream` connection.
   */
  @Sse('stream')
  stream(
    @Query('userId', new ParseUUIDPipe()) userId: string,
    @Req() req: Request,
  ): Observable<MessageEvent> {
    const allChannels: SseChannel[] = [
      'transactions',
      'wallet',
      'ai-insights',
      'prices',
    ];

    const { connectionId, subject } = this.realtimeService.subscribe(
      userId,
      allChannels,
    );

    req.on('close', () => this.realtimeService.unsubscribe(connectionId));

    return subject.asObservable();
  }

  /**
   * Wallet-only stream — for the dashboard wallet widget.
   * @param userId - UUID of the authenticated user.
   * @returns An open `text/event-stream` connection filtered to wallet events.
   */
  @Sse('wallet')
  wallet(
    @Query('userId', new ParseUUIDPipe()) userId: string,
    @Req() req: Request,
  ): Observable<MessageEvent> {
    const { connectionId, subject } = this.realtimeService.subscribe(
      userId,
      ['wallet'],
    );

    req.on('close', () => this.realtimeService.unsubscribe(connectionId));

    return subject.asObservable();
  }

  /**
   * Global price feed — no authentication required.
   * Receives `ASSET_PRICE_CHANGED` events for all assets.
   * @returns An open `text/event-stream` connection filtered to price events.
   */
  @Sse('prices')
  prices(@Req() req: Request): Observable<MessageEvent> {
    const { connectionId, subject } = this.realtimeService.subscribe(
      null,
      ['prices'],
    );

    req.on('close', () => this.realtimeService.unsubscribe(connectionId));

    return subject.asObservable();
  }
}
