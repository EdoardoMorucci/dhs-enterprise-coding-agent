// Correct qualification fixture. Never copied into agent demo workspaces.
export function createOrderStore() {
  const orders = new Map();
  return {
    create(input) {
      if (!input || typeof input.requestId !== 'string' || !input.requestId.trim() ||
          typeof input.customer !== 'string' || !input.customer.trim() ||
          !Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
        throw new Error('Invalid order: requestId, customer and positive integer quantity required');
      }
      const previous = orders.get(input.requestId);
      if (previous) {
        if (previous.customer !== input.customer || previous.quantity !== input.quantity) {
          throw new Error('Request identifier already used for a different order');
        }
        return { ...previous };
      }
      const order = { id: `order-${orders.size + 1}`, requestId: input.requestId, customer: input.customer, quantity: input.quantity };
      orders.set(input.requestId, order);
      return { ...order };
    },
    list() { return [...orders.values()].map(order => ({ ...order })); }
  };
}
