from datetime import date
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from .services.calc import Env, Overrides


class EnvIn(BaseModel):
    petrol: float | None = Field(None, ge=0, le=1000)
    diesel: float | None = Field(None, ge=0, le=1000)
    kwh: float | None = Field(None, ge=0, le=100)
    rate: float | None = Field(None, gt=0, le=1000)
    km: int | None = Field(None, ge=0, le=200000)
    years: int | None = Field(None, ge=1, le=20)
    other: float | None = Field(None, ge=0, le=100000)

    def to_env(self) -> Env:
        env = Env.default()
        for k, v in self.model_dump(exclude_none=True).items():
            setattr(env, k, v)
        return env


class OverridesIn(BaseModel):
    price: float | None = Field(None, ge=0)
    cons: float | None = Field(None, ge=0, le=100)
    maint: float | None = Field(None, ge=0)
    repair: float | None = Field(None, ge=0)
    ins: float | None = Field(None, ge=0)
    dep_pct: float | None = Field(None, ge=0, le=100)

    def to_overrides(self) -> Overrides:
        return Overrides(**self.model_dump())


class CompareIn(BaseModel):
    slugs: list[str] = Field(min_length=2, max_length=5)
    env: EnvIn = EnvIn()


class TcoIn(BaseModel):
    slugs: list[str] = Field(min_length=1, max_length=5)
    env: EnvIn = EnvIn()
    overrides: dict[str, OverridesIn] = {}


class Filters(BaseModel):
    max_price: float | None = Field(None, ge=0)
    body: str | None = None
    fuel: str | None = None
    trans: Literal["any", "automatic", "manual"] | None = None
    drive: str | None = None


class RatingIn(BaseModel):
    weights: dict[str, float] = {}
    preset: str | None = None
    filters: Filters = Filters()
    env: EnvIn = EnvIn()


class ParseIn(BaseModel):
    q: str = Field(max_length=500)


class CheckIn(BaseModel):
    slug: str
    year: int = Field(ge=1980, le=2100)
    km: int = Field(ge=0, le=2_000_000)
    price: float = Field(ge=0)
    condition: Literal["excellent", "good", "needs"] = "good"
    vin: str = Field("", max_length=30)


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field("", max_length=120)


class LoginIn(BaseModel):
    email: str = Field(max_length=200)
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str


class TokenOut(BaseModel):
    token: str
    user: UserOut


class SavedIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slugs: list[str] = Field(min_length=2, max_length=5)


class GarageCarIn(BaseModel):
    slug: str | None = None
    name: str = Field(min_length=1, max_length=120)
    start_km: int = Field(0, ge=0, le=2_000_000)


class GarageEntryIn(BaseModel):
    date: date
    type: Literal["fuel", "service", "repair", "other"]
    cost_uah: float = Field(ge=0, le=10_000_000)
    km: int = Field(ge=0, le=2_000_000)
    note: str = Field("", max_length=500)


class ImportIn(BaseModel):
    csv: str = Field(max_length=2_000_000)


class CarPatch(BaseModel):
    """Editable fields. A change to a critical value sets status to 'partial' until reviewed."""
    hp: int | None = None
    torque: int | None = None
    acc: float | None = None
    vmax: int | None = None
    cons_pass: float | None = None
    cons_real: float | None = None
    price: float | None = None
    maint_per_year: float | None = None
    repair_per_year: float | None = None
    depreciation: float | None = None
    reliability: int | None = None
    source: str | None = None
    status: Literal["verified", "partial", "unverified"] | None = None
