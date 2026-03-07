from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class ReportKpis(BaseModel):
    jobs_created: int
    jobs_completed: int
    avg_completion_minutes: float
    technician_utilization: int
    invoice_total: float
    pending_approvals: int


class DispatchStatusRow(BaseModel):
    status: str
    count: int
    percentage: int


class InvoiceStatusRow(BaseModel):
    state: str
    count: int
    total_amount: float
    is_critical: bool = False


class TechnicianPerformanceRow(BaseModel):
    id: str
    name: str
    jobs_assigned: int
    jobs_completed: int
    avg_completion_time: str
    delays_count: int
    refusals_count: int
    revenue_generated: float


class DealershipPerformanceRow(BaseModel):
    id: str
    name: str
    jobs_created: int
    jobs_completed: int
    avg_resolution_time: str
    invoice_total: float
    attention_flags: int


class InvoicingDetailRow(BaseModel):
    technician: str
    approved_amount: float
    average_invoice: float
    growth_percentage: Optional[float] = None


class ReportsOverviewResponse(BaseModel):
    generated_at: datetime
    from_date: datetime
    to_date: datetime
    current_period_invoice_count: int
    revenue_delta: float
    kpis: ReportKpis
    dispatch_performance: List[DispatchStatusRow]
    invoice_performance: List[InvoiceStatusRow]
    technician_performance: List[TechnicianPerformanceRow]
    dealership_performance: List[DealershipPerformanceRow]
    invoicing_detail_rows: List[InvoicingDetailRow]
