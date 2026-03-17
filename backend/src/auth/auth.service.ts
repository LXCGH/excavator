import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LoginDto } from './login.dto';

export interface LoginResult {
  token: string;
  userId: string;
  nickname: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly demoUser = {
    username: process.env.DEMO_USERNAME ?? 'player',
    password: process.env.DEMO_PASSWORD ?? 'excavator123',
    nickname: process.env.DEMO_NICKNAME ?? '试玩玩家',
    userId: process.env.DEMO_USER_ID ?? 'demo-user-001',
  };

  login(dto: LoginDto): LoginResult {
    const username = dto?.username?.trim();
    const password = dto?.password?.trim();

    if (!username || !password) {
      throw new BadRequestException('用户名和密码不能为空');
    }

    if (
      username !== this.demoUser.username ||
      password !== this.demoUser.password
    ) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    return {
      token: Buffer.from(`${this.demoUser.userId}:${randomUUID()}`).toString('base64url'),
      userId: this.demoUser.userId,
      nickname: this.demoUser.nickname,
      expiresIn: 60 * 60,
    };
  }
}
