export enum moduleTypeNotification {
    ORDER = "ORDERS",
    WORK_ORDER = "WORK_ORDERS",
    COMPLAINT = "COMPLAINTS",
    REFUND = "REFUNDS",
    RESCHEDULE = "RESCHEDULES",
    INCENTIVE = "INCENTIVE",
    QUOTATION = "QUOTATION",
    INVOICE = "INVOICES",
}

export const moduleRolesMapping: Record<moduleTypeNotification, string[]> = {
    [moduleTypeNotification.ORDER]: ['Owner Vendor', 'Admin Vendor', 'Sales', 'Tukang', 'Store CS'],
    [moduleTypeNotification.WORK_ORDER]: ['Owner Vendor', 'Admin Vendor', 'Tukang'],
    [moduleTypeNotification.COMPLAINT]: ['Owner Vendor', 'Admin Vendor', 'Store CS', 'Tukang'],
    [moduleTypeNotification.REFUND]: ['Owner Vendor', 'Admin Vendor', 'Store CS', 'Tukang'],
    [moduleTypeNotification.RESCHEDULE]: ['Owner Vendor', 'Admin Vendor', 'Store CS', 'Tukang'],
    [moduleTypeNotification.INCENTIVE]: ['Sales'],
    [moduleTypeNotification.QUOTATION]: ['Owner Vendor', 'Admin Vendor', 'Store CS'],
    [moduleTypeNotification.INVOICE]: ['Owner Vendor', 'Admin Vendor'],
};