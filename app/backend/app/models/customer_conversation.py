from uuid import uuid4

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    Time,
    Uuid,
    text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .base import Base


class CustomerConversation(Base):
    __tablename__ = "customer_conversations"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    reference_number = Column(String(64), nullable=False, unique=True, index=True)
    source_channel = Column(String(32), nullable=False)
    status = Column(String(32), nullable=False, server_default=text("'bot_active'"))
    urgency = Column(String(16), nullable=False, server_default=text("'normal'"))

    customer_name = Column(String(255), nullable=True)
    contact_person = Column(String(255), nullable=True)
    phone = Column(String(64), nullable=True)
    email = Column(String(255), nullable=True)

    dealership_id = Column(Uuid(as_uuid=True), ForeignKey("dealerships.id"), nullable=True)
    dealership_name = Column(String(255), nullable=True)

    requested_service_text = Column(Text, nullable=True)
    matched_service_id = Column(Uuid(as_uuid=True), ForeignKey("service_catalog.id"), nullable=True)
    matched_service_name = Column(String(255), nullable=True)
    matched_service_candidates = Column(JSON, nullable=True)

    preferred_date = Column(Date, nullable=True)
    preferred_time = Column(Time, nullable=True)
    service_location_or_branch = Column(String(255), nullable=True)
    vehicle_description = Column(Text, nullable=True)
    vehicle_unit_or_stock_number = Column(String(64), nullable=True)
    special_notes = Column(Text, nullable=True)

    assigned_admin_label = Column(String(255), nullable=True)
    source_session_id = Column(String(128), nullable=True, index=True)
    source_metadata = Column(JSON, nullable=True)

    linked_job_id = Column(Uuid(as_uuid=True), ForeignKey("jobs.id"), nullable=True)
    last_message_preview = Column(String(500), nullable=True)
    last_message_at = Column(DateTime(timezone=True), nullable=True)
    last_activity_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    unread_count = Column(Integer, nullable=False, server_default=text("0"))
    unread_email_alert_sent_at = Column(DateTime(timezone=True), nullable=True)

    agent_joined_at = Column(DateTime(timezone=True), nullable=True)
    waiting_for_customer_at = Column(DateTime(timezone=True), nullable=True)
    escalated_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    missed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    dealership = relationship("Dealership")
    matched_service = relationship("ServiceCatalog")
    linked_job = relationship("Job")
    messages = relationship(
        "CustomerConversationMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="CustomerConversationMessage.created_at.asc()",
    )
    notes = relationship(
        "CustomerConversationNote",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="CustomerConversationNote.created_at.asc()",
    )
    intake = relationship(
        "CustomerIntakeRecord",
        back_populates="conversation",
        cascade="all, delete-orphan",
        uselist=False,
    )

    __table_args__ = (
        CheckConstraint(
            "source_channel IN ('website_chatbot','customer_portal','booking_form','status_page')",
            name="customer_conversations_source_channel_chk",
        ),
        CheckConstraint(
            "status IN ('bot_active','waiting_for_agent','agent_joined','intake_created','converted_to_job','waiting_for_customer','closed','escalated','missed')",
            name="customer_conversations_status_chk",
        ),
        CheckConstraint(
            "urgency IN ('low','normal','high','urgent')",
            name="customer_conversations_urgency_chk",
        ),
        CheckConstraint("unread_count >= 0", name="customer_conversations_unread_count_chk"),
    )


class CustomerConversationMessage(Base):
    __tablename__ = "customer_conversation_messages"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id = Column(
        Uuid(as_uuid=True),
        ForeignKey("customer_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_type = Column(String(16), nullable=False)
    sender_label = Column(String(255), nullable=True)
    message_kind = Column(String(32), nullable=False, server_default=text("'text'"))
    body = Column(Text, nullable=False)
    attachment_url = Column(Text, nullable=True)
    attachment_name = Column(String(255), nullable=True)
    attachment_mime_type = Column(String(128), nullable=True)
    metadata_json = Column("metadata", JSON, nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    conversation = relationship("CustomerConversation", back_populates="messages")

    __table_args__ = (
        CheckConstraint("sender_type IN ('bot','customer','admin','system')", name="customer_conversation_messages_sender_type_chk"),
    )


class CustomerConversationNote(Base):
    __tablename__ = "customer_conversation_notes"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id = Column(
        Uuid(as_uuid=True),
        ForeignKey("customer_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_admin_id = Column(Uuid(as_uuid=True), nullable=False)
    author_admin_label = Column(String(255), nullable=True)
    note_body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    conversation = relationship("CustomerConversation", back_populates="notes")


class CustomerIntakeRecord(Base):
    __tablename__ = "customer_intake_records"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    intake_number = Column(String(64), nullable=False, unique=True, index=True)
    source_system = Column(String(32), nullable=False, server_default=text("'customer_chatbot'"))
    status = Column(String(16), nullable=False, server_default=text("'new'"))

    conversation_id = Column(
        Uuid(as_uuid=True),
        ForeignKey("customer_conversations.id", ondelete="CASCADE"),
        nullable=True,
        unique=True,
        index=True,
    )
    dealership_id = Column(Uuid(as_uuid=True), ForeignKey("dealerships.id"), nullable=True)
    customer_name = Column(String(255), nullable=True)
    contact_person = Column(String(255), nullable=True)
    phone = Column(String(64), nullable=True)
    email = Column(String(255), nullable=True)
    requested_service_text = Column(Text, nullable=True)
    matched_service_id = Column(Uuid(as_uuid=True), ForeignKey("service_catalog.id"), nullable=True)
    matched_service_name = Column(String(255), nullable=True)
    vehicle_description = Column(Text, nullable=True)
    vehicle_unit_or_stock_number = Column(String(64), nullable=True)
    preferred_date = Column(Date, nullable=True)
    preferred_time = Column(Time, nullable=True)
    location_branch = Column(String(255), nullable=True)
    urgency = Column(String(16), nullable=False, server_default=text("'normal'"))
    notes = Column(Text, nullable=True)
    linked_job_id = Column(Uuid(as_uuid=True), ForeignKey("jobs.id"), nullable=True)

    created_by_admin_id = Column(Uuid(as_uuid=True), nullable=True)
    created_by_admin_label = Column(String(255), nullable=True)
    updated_by_admin_id = Column(Uuid(as_uuid=True), nullable=True)
    updated_by_admin_label = Column(String(255), nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    conversation = relationship("CustomerConversation", back_populates="intake")
    dealership = relationship("Dealership")
    matched_service = relationship("ServiceCatalog")
    linked_job = relationship("Job")

    __table_args__ = (
        CheckConstraint(
            "source_system IN ('customer_chatbot','customer_portal','booking_form','status_page')",
            name="customer_intake_records_source_system_chk",
        ),
        CheckConstraint(
            "status IN ('new','reviewed','converted','closed')",
            name="customer_intake_records_status_chk",
        ),
        CheckConstraint(
            "urgency IN ('low','normal','high','urgent')",
            name="customer_intake_records_urgency_chk",
        ),
    )
