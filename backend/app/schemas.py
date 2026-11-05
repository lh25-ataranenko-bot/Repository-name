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
    # Production year per car: price, resale and insurance are then counted from a car of that year.
    years: dict[str, int] = Field({}, max_length=5)


class TcoIn(BaseModel):
    slugs: list[str] = Field(min_length=1, max_length=5)
    env: EnvIn = EnvIn()
    overrides: dict[str, OverridesIn] = {}
    # Production year per car: price, resale and insurance are then counted from a car of that year.
    years: dict[str, int] = Field({}, max_length=5)


class Filters(BaseModel):
    max_price: float | None = Field(None, ge=0)
    year: int | None = Field(None, ge=1950, le=2100)
    brand: str | None = Field(None, max_length=80)
    model: str | None = Field(None, max_length=80)
    body: str | None = None
    fuel: str | None = None
    trans: Literal["any", "automatic", "manual"] | None = None
    drive: str | None = None


class RatingIn(BaseModel):
    limit: int = Field(50, ge=1, le=200)
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
    email_verified: bool = False


class TokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class ForgotIn(BaseModel):
    email: str = Field(max_length=200)


class ResetIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=8, max_length=128)


class PasswordChangeIn(BaseModel):
    current: str = Field(max_length=128)
    new: str = Field(min_length=8, max_length=128)


class ProfileIn(BaseModel):
    name: str = Field(max_length=120)


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
    client_id: str | None = Field(None, min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


class ImportIn(BaseModel):
    csv: str = Field(max_length=2_000_000)


Body = Literal["sedan", "liftback", "crossover", "hatch", "wagon", "minivan", "van", "pickup"]
FuelT = Literal["petrol", "diesel", "hybrid", "electric"]
TransT = Literal["auto", "robot", "cvt", "manual", "reducer"]
DriveT = Literal["FWD", "RWD", "AWD"]


class CarFields(BaseModel):
    """Every editable characteristic. Ranges catch unit mistakes (mpg instead of l/100 km, etc.)."""
    name: str | None = Field(None, min_length=1, max_length=120)
    year_from: int | None = Field(None, ge=1950, le=2100)
    year_to: int | None = Field(None, ge=1950, le=2100)
    year_ref: int | None = Field(None, ge=1950, le=2100)
    body: Body | None = None
    fuel: FuelT | None = None
    engine_code: str | None = Field(None, max_length=80)
    displacement: int | None = Field(None, ge=500, le=9000)
    hp: int | None = Field(None, ge=30, le=1500)
    torque: int | None = Field(None, ge=50, le=1500)
    transmission: str | None = Field(None, max_length=80)
    trans_type: TransT | None = None
    drive: DriveT | None = None
    acc: float | None = Field(None, ge=2, le=30)
    vmax: int | None = Field(None, ge=80, le=420)
    cons_pass: float | None = Field(None, ge=1, le=40)
    cons_real: float | None = Field(None, ge=1, le=40)
    tank: float | None = Field(None, ge=10, le=200)
    battery: float | None = Field(None, ge=5, le=250)
    length: int | None = Field(None, ge=2000, le=7000)
    width: int | None = Field(None, ge=1200, le=2600)
    height: int | None = Field(None, ge=1000, le=2500)
    wheelbase: int | None = Field(None, ge=1500, le=4500)
    clearance: int | None = Field(None, ge=80, le=400)
    trunk: int | None = Field(None, ge=0, le=20000)  # vans: cargo volume
    ncap: int | None = Field(None, ge=0, le=5)
    ncap_year: int | None = Field(None, ge=1997, le=2100)
    airbags: int | None = Field(None, ge=0, le=20)
    assists: list[Literal["AEB", "LKA", "ACC", "BSM", "RCTA"]] | None = None
    comfort: float | None = Field(None, ge=0, le=10)
    reliability: int | None = Field(None, ge=0, le=100)
    reliability_confidence: Literal["висока", "середня", "низька"] | None = None
    maint_per_year: float | None = Field(None, ge=0, le=20000)
    repair_per_year: float | None = Field(None, ge=0, le=20000)
    depreciation: float | None = Field(None, ge=0, le=0.6)
    liquidity: Literal["висока", "середня", "низька"] | None = None
    price: float | None = Field(None, ge=500, le=1_000_000)
    source: str | None = Field(None, max_length=200)


class CarPatch(CarFields):
    """A change to a critical value sets status to 'partial' until an editor reviews it."""
    status: Literal["verified", "partial", "unverified"] | None = None


class CarCreate(CarFields):
    brand: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=80)
    generation: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    body: Body
    fuel: FuelT
    trans_type: TransT
    drive: DriveT


class IssueIn(BaseModel):
    part: str = Field(min_length=1, max_length=200)
    frequency: Literal["часто", "іноді", "рідко"]
    cost: float = Field(0, ge=0, le=100000)


class RoleIn(BaseModel):
    role: Literal["user", "editor", "admin"]


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=4000)


class AssistantIn(BaseModel):
    messages: list[ChatTurn] = Field(min_length=1, max_length=20)
