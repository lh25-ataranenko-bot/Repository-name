"""Catalogue hierarchy: brand → model → generation → modification (+ issues),
plus user data (favourites, saved comparisons, garage) and the change log."""

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Brand(Base):
    __tablename__ = "brands"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    models: Mapped[list["CarModel"]] = relationship(back_populates="brand", order_by="CarModel.name")


class CarModel(Base):
    __tablename__ = "models"
    __table_args__ = (UniqueConstraint("brand_id", "name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    brand: Mapped[Brand] = relationship(back_populates="models")
    generations: Mapped[list["Generation"]] = relationship(back_populates="model", order_by="Generation.name")


class Generation(Base):
    __tablename__ = "generations"
    __table_args__ = (UniqueConstraint("model_id", "name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    model_id: Mapped[int] = mapped_column(ForeignKey("models.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    model: Mapped[CarModel] = relationship(back_populates="generations")
    modifications: Mapped[list["Modification"]] = relationship(back_populates="generation")


class Modification(Base):
    __tablename__ = "modifications"
    __table_args__ = (UniqueConstraint("generation_id", "name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    generation_id: Mapped[int] = mapped_column(ForeignKey("generations.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    year_from: Mapped[int | None] = mapped_column(Integer)
    year_to: Mapped[int | None] = mapped_column(Integer)
    year_ref: Mapped[int | None] = mapped_column(Integer)  # year the market price refers to
    body: Mapped[str] = mapped_column(String(20))
    fuel: Mapped[str] = mapped_column(String(20))
    engine_code: Mapped[str | None] = mapped_column(String(80))
    displacement: Mapped[int | None] = mapped_column(Integer)  # cm³
    hp: Mapped[int | None] = mapped_column(Integer)
    torque: Mapped[int | None] = mapped_column(Integer)  # N·m
    transmission: Mapped[str | None] = mapped_column(String(80))
    trans_type: Mapped[str] = mapped_column(String(20))  # auto | robot | cvt | manual | reducer
    drive: Mapped[str] = mapped_column(String(5))  # FWD | RWD | AWD
    acc: Mapped[float | None] = mapped_column(Float)  # 0–100 km/h, s
    vmax: Mapped[int | None] = mapped_column(Integer)
    cons_pass: Mapped[float | None] = mapped_column(Float)  # l or kWh per 100 km, passport
    cons_real: Mapped[float | None] = mapped_column(Float)  # real-world
    tank: Mapped[float | None] = mapped_column(Float)  # l
    battery: Mapped[float | None] = mapped_column(Float)  # usable kWh
    length: Mapped[int | None] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    wheelbase: Mapped[int | None] = mapped_column(Integer)
    clearance: Mapped[int | None] = mapped_column(Integer)
    trunk: Mapped[int | None] = mapped_column(Integer)
    ncap: Mapped[int | None] = mapped_column(Integer)
    ncap_year: Mapped[int | None] = mapped_column(Integer)
    airbags: Mapped[int | None] = mapped_column(Integer)
    assists: Mapped[list[str]] = mapped_column(JSON, default=list)
    comfort: Mapped[float | None] = mapped_column(Float)  # expert index 0–10
    reliability: Mapped[int | None] = mapped_column(Integer)  # expert index 0–100
    reliability_confidence: Mapped[str | None] = mapped_column(String(20))
    maint_per_year: Mapped[float | None] = mapped_column(Float)  # USD
    repair_per_year: Mapped[float | None] = mapped_column(Float)  # USD
    depreciation: Mapped[float | None] = mapped_column(Float)  # share per year, 0.1 = 10 %
    liquidity: Mapped[str | None] = mapped_column(String(20))
    price: Mapped[float | None] = mapped_column(Float)  # USD at year_ref
    source: Mapped[str | None] = mapped_column(String(200))
    updated_at: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="unverified")  # verified | partial | unverified

    generation: Mapped[Generation] = relationship(back_populates="modifications")
    issues: Mapped[list["Issue"]] = relationship(back_populates="modification", cascade="all, delete-orphan")

    @property
    def brand_name(self) -> str:
        return self.generation.model.brand.name

    @property
    def model_name(self) -> str:
        return self.generation.model.name

    @property
    def generation_name(self) -> str:
        return self.generation.name


class Issue(Base):
    __tablename__ = "issues"
    id: Mapped[int] = mapped_column(primary_key=True)
    modification_id: Mapped[int] = mapped_column(ForeignKey("modifications.id", ondelete="CASCADE"))
    part: Mapped[str] = mapped_column(String(200))
    frequency: Mapped[str] = mapped_column(String(20))  # часто | іноді | рідко
    cost: Mapped[float] = mapped_column(Float, default=0)
    modification: Mapped[Modification] = relationship(back_populates="issues")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="user")  # user | editor | admin
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Bumped on password change/reset: every token issued before stops working.
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuthToken(Base):
    """One-time token from an email link. Only its SHA-256 hash is stored."""
    __tablename__ = "auth_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purpose: Mapped[str] = mapped_column(String(20))  # verify | reset
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Favorite(Base):
    __tablename__ = "favorites"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    modification_id: Mapped[int] = mapped_column(ForeignKey("modifications.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SavedComparison(Base):
    __tablename__ = "saved_comparisons"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    slugs: Mapped[list[str]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GarageCar(Base):
    __tablename__ = "garage_cars"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    modification_id: Mapped[int | None] = mapped_column(ForeignKey("modifications.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(120))
    start_km: Mapped[int] = mapped_column(Integer, default=0)
    entries: Mapped[list["GarageEntry"]] = relationship(
        back_populates="car", cascade="all, delete-orphan", order_by="GarageEntry.date"
    )
    modification: Mapped[Modification | None] = relationship()


class GarageEntry(Base):
    __tablename__ = "garage_entries"
    __table_args__ = (UniqueConstraint("garage_car_id", "client_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    garage_car_id: Mapped[int] = mapped_column(ForeignKey("garage_cars.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date)
    type: Mapped[str] = mapped_column(String(20))  # fuel | service | repair | other
    cost_uah: Mapped[float] = mapped_column(Float)
    km: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(Text, default="")
    # Set by the app; a resend of an entry queued offline carries the same id and is ignored.
    client_id: Mapped[str | None] = mapped_column(String(64))
    car: Mapped[GarageCar] = relationship(back_populates="entries")


class ChangeLog(Base):
    __tablename__ = "change_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    modification_id: Mapped[int | None] = mapped_column(ForeignKey("modifications.id", ondelete="SET NULL"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(30))  # import | update | review
    field: Mapped[str | None] = mapped_column(String(60))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Review(Base):
    """An owner's review of a modification. Visible only after an editor publishes it."""
    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("user_id", "modification_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    modification_id: Mapped[int] = mapped_column(ForeignKey("modifications.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    rating: Mapped[int] = mapped_column(Integer)  # 1–5
    pros: Mapped[str] = mapped_column(Text, default="")
    cons: Mapped[str] = mapped_column(Text, default="")
    car_year: Mapped[int | None] = mapped_column(Integer)
    owned_years: Mapped[float | None] = mapped_column(Float)
    mileage_km: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending | published | rejected
    reject_reason: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    user: Mapped[User] = relationship()
    modification: Mapped[Modification] = relationship()


class CarViewDay(Base):
    """Page views of a modification per day. Only counts: nothing about the visitor is stored."""
    __tablename__ = "car_view_days"
    modification_id: Mapped[int] = mapped_column(ForeignKey("modifications.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    views: Mapped[int] = mapped_column(Integer, default=0)
