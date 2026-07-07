// Browser shim for the Node `crypto` builtin pulled in by @butterbase/shared.
export const randomUUID = () => globalThis.crypto.randomUUID();
export default { randomUUID };
