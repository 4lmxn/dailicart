import type { AdminStackParamList, DistributorStackParamList } from './types';

export function normalizeId(v: string | number | undefined) {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

export function parseAdminCustomerDetailParams(params: any): AdminStackParamList['CustomerDetail'] {
  return { customerId: normalizeId(params?.customerId) as string };
}

export function parseAdminDistributorDetailParams(params: any): AdminStackParamList['DistributorDetail'] {
  return { distributorId: normalizeId(params?.distributorId) as string };
}

export function parseAdminSubscriptionDetailParams(params: any): AdminStackParamList['SubscriptionDetail'] {
  return { subscriptionId: normalizeId(params?.subscriptionId) as string };
}

export function parseDistributorBuildingDeliveriesParams(params: any): DistributorStackParamList['BuildingDeliveries'] {
  return {
    buildingId: normalizeId(params?.buildingId) as string,
    buildingName: (params?.buildingName ? String(params.buildingName) : 'Building') as string,
    societyName: (params?.societyName ? String(params.societyName) : 'Society') as string,
  };
}

export const DeepLinkExamples = {
  adminCustomerDetail: (id: string) => `idaily://admin/customers/${encodeURIComponent(id)}`,
  adminDistributorDetail: (id: string) => `idaily://admin/distributors/${encodeURIComponent(id)}`,
  adminSubscriptionDetail: (id: string) => `idaily://admin/subscriptions/${encodeURIComponent(id)}`,
  distributorBuildingDeliveries: (id: string) => `idaily://distributor/buildings/${encodeURIComponent(id)}`,
  customerProducts: () => `idaily://customer/products`,
};
