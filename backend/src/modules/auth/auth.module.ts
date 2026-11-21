import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordRecoveryService } from './password-recovery.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordRecoveryService],
  exports: [AuthService],
})
export class AuthModule {}
