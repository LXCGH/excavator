import { Module } from '@nestjs/common';
import { DrawGuessGateway } from './draw-guess.gateway';
import { DrawGuessService } from './draw-guess.service';

@Module({
  providers: [DrawGuessGateway, DrawGuessService],
})
export class DrawGuessModule {}
