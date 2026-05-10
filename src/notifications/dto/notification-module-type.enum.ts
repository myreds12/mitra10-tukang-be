export enum moduleTypeNotification {
    ORDER = "ORDERS",
    WORK_ORDER = "WORK_ORDERS",
    COMPLAINT = "COMPLAINTS",
    REFUND = "REFUNDS",
    RESCHEDULE = "RESCHEDULES",
    INCENTIVE = "INCENTIVE",
    QUOTATION = "QUOTATION",
    INVOICE = "INVOICES",
    QUOTATION_PROMOTION = "QUOTATION_PROMOTION",
    COMISSION_SALES_INCENTIVE = "COMISSION_SALES_INCENTIVE",
    VENDOR_VIOLATION = "VENDOR_VIOLATION",
    VENDOR_SP = "VENDOR_SP"
}

export const moduleRolesMapping: Record<moduleTypeNotification, string[]> = {
    [moduleTypeNotification.ORDER]: ['Owner Vendor', 'Admin Vendor', 'Sales', 'Tukang', 'Store CS'],
    [moduleTypeNotification.QUOTATION_PROMOTION]: [''],
    [moduleTypeNotification.COMISSION_SALES_INCENTIVE]: ['Sales', 'Payroll'],
    [moduleTypeNotification.WORK_ORDER]: ['Owner Vendor', 'Admin Vendor', 'Tukang'],
    [moduleTypeNotification.COMPLAINT]: ['Owner Vendor', 'Admin Vendor', 'Store CS', 'Tukang'],
    [moduleTypeNotification.REFUND]: ['Owner Vendor', 'Admin Vendor', 'Store CS', 'Tukang'],
    [moduleTypeNotification.RESCHEDULE]: ['Owner Vendor', 'Admin Vendor', 'Store CS', 'Tukang'],
    [moduleTypeNotification.INCENTIVE]: ['Sales', 'Payroll'],
    [moduleTypeNotification.QUOTATION]: ['Owner Vendor', 'Admin Vendor', 'Store CS'],
    [moduleTypeNotification.INVOICE]: ['Owner Vendor', 'Admin Vendor'],
    [moduleTypeNotification.VENDOR_VIOLATION]: ['Owner Vendor', 'Admin Vendor'],
    [moduleTypeNotification.VENDOR_SP]: ['Owner Vendor', 'Admin Vendor'],
};