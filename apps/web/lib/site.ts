export const customerAppUrl =
  process.env.NEXT_PUBLIC_CUSTOMER_APP_URL || 'http://localhost:3002';

export const adminAppUrl =
  process.env.NEXT_PUBLIC_ADMIN_APP_URL || 'http://localhost:3003';

export function customerAppPath(path = '') {
  return `${customerAppUrl}${path}`;
}

export function adminAppPath(path = '') {
  return `${adminAppUrl}${path}`;
}
