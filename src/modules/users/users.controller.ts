import { Controller, Get, Post } from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from './users.service';
import { ok } from '../common/helpers/response.helper';
import type { IApiResponse } from 'src/common/dtos/response.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('test')
  async createTest(): Promise<IApiResponse<any>> {
    const user = await this.usersService.createTestUser();
    return ok(user, 'Test user created successfully', 201);
  }

  @Get()
  async getAll() {
    const users = await this.usersService.findAll();
    return ok(users, 'Users retrieved successfully');
  }
}
