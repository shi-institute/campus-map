declare module 'koa' {
  interface DefaultState {
    user: Express.User | undefined;
  }

  interface DefaultContext {}
}

export {};
