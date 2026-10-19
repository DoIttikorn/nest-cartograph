import { Injectable, Module } from '@nestjs/common';

@Injectable()
export class HealthService {}

@Module({ providers: [HealthService], exports: [HealthService] })
export class HealthModule {}

export const SHARED_IMPORTS = [HealthModule];

/** Decorated but never registered: the static collector should warn about it. */
@Injectable()
export class OrphanService {}
