import { Module } from '@nestjs/common';
import { AModule } from './a.module.js';

@Module({ imports: [AModule] })
export class BModule {}
