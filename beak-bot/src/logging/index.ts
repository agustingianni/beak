import chalk, { ChalkInstance } from 'chalk';
import { bool, envsafe } from 'envsafe';

const { TRACE, DEBUG } = envsafe({
  DEBUG: bool({
    devDefault: true,
    default: false,
    desc: 'Enables debug mode, which provides more detailed logging.'
  }),
  TRACE: bool({
    default: false,
    desc: 'Enables trace mode, which provides much more detailed logging.'
  })
});

function log(level: string, color: ChalkInstance, ...args: unknown[]) {
  console.log(
    chalk.gray('['),
    color(level.padEnd(5)),
    chalk.gray(']'),
    ...args.map((arg) => (typeof arg === 'string' ? chalk.white(arg) : arg))
  );
}

export function info(...args: unknown[]) {
  log('info', chalk.green, ...args);
}

export function warning(...args: unknown[]) {
  log('warning', chalk.red, ...args);
}

export function error(...args: unknown[]) {
  log('error', chalk.red, ...args);
}

export function trace(...args: unknown[]) {
  if (!TRACE) return;
  log('trace', chalk.magenta, ...args);
}

export function debug(...args: unknown[]) {
  if (!DEBUG) return;
  log('debug', chalk.blue, ...args);
}

export function Trace(_target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;

  descriptor.value = function (...args: any[]) {
    trace(`${propertyKey}: [${args.map((a) => JSON.stringify(a)).join(', ')}]`);
    return method.apply(this, args);
  };

  return descriptor;
}

export function Debug(_target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;

  descriptor.value = function (...args: any[]) {
    debug(`${propertyKey}: [${args.map((a) => JSON.stringify(a)).join(', ')}]`);
    return method.apply(this, args);
  };

  return descriptor;
}
