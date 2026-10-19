/**
 * Wrap the type of a circular dependency so `emitDecoratorMetadata` writes `Object` instead of
 * touching the class while ES modules are still being evaluated. `@Inject(forwardRef(...))`
 * supplies the real token.
 */
export type WrapperType<T> = T;
