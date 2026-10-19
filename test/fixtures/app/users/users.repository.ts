import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersRepository {
  find(id: string) {
    return { id };
  }
}
