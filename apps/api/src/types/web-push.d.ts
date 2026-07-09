// The `web-push` package ships without bundled TypeScript types and no
// `@types/web-push` is installed. We only use a small, dynamically-typed slice
// of its API (setVapidDetails, sendNotification), so an ambient `any` module
// declaration is sufficient to satisfy the compiler.
declare module 'web-push';
