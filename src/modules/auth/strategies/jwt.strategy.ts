import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';
import { extractJwtFromRequest } from '../utils/jwt-extractor';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private config: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: (req: Request) => extractJwtFromRequest(req),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret') || 'change-me-in-production',
    });
  }

  async validate(payload: { sub: string; type?: string }) {
    if (payload.type !== 'access') throw new UnauthorizedException();
    const user = await this.usersService.findOne(payload.sub);
    if (user.isSuspended || user.status === 'BLOCKED') {
      throw new UnauthorizedException('Account suspended');
    }
    return user;
  }
}
