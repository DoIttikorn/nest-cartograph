import { Injectable } from '@nestjs/common';
import { UsersService } from './users/users.service.js';

@Injectable()
export class AppService {
  constructor(private readonly users: UsersService) {}
}
