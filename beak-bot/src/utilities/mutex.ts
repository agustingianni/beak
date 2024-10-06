import { Mutex } from 'async-mutex';

const mutex = new Mutex();

export function WithMutex() {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const release = await mutex.acquire();
      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } finally {
        release();
      }
    };

    return descriptor;
  };
}
