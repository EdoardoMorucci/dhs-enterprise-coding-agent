// Deliberately buggy demo seed: a retry creates another order.
// State lives in memory and is lost when the server restarts.
export function createOrderStore() {
  const orders = [];
  return {
    create(input) {
      if (!input || typeof input.requestId !== 'string' || !input.requestId.trim() ||
          typeof input.customer !== 'string' || !input.customer.trim() ||
          !Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
        throw new Error('Invalid order: requestId, customer and positive integer quantity required');
      }
      const order = { id: `order-${orders.length + 1}`, requestId: input.requestId, customer: input.customer, quantity: input.quantity };
      orders.push(order);
      return { ...order };
    },
    list() { return orders.map(order => ({ ...order })); }
  };
}
