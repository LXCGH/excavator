import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DrawGuessModule } from './draw-guess/draw-guess.module';

@Module({
  imports: [AuthModule, DrawGuessModule],
})
export class AppModule {}
