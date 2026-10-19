import { Module } from '@nestjs/common';
import { BModule } from './b.module.js';

// A ↔ B without forwardRef(): Nest fails at startup, the static collector reports it.
@Module({ imports: [BModule] })
export class AModule {}
