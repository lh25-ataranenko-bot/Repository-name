import io

from PIL import Image


def jpeg(w=2400, h=1600, exif=True):
    img = Image.new("RGB", (w, h), (30, 70, 200))
    buf = io.BytesIO()
    if exif:
        ex = Image.Exif()
        ex[0x010F] = "SecretCamera"  # Make
        img.save(buf, "JPEG", exif=ex)
    else:
        img.save(buf, "JPEG")
    return buf.getvalue()


def test_upload_flow(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    slug = "mazda-cx30-dm-20"
    up = lambda data, **form: client.post(f"/api/admin/cars/{slug}/photos", headers=h,
                                          files={"file": ("car.jpg", data, "image/jpeg")}, data=form)
    # licence rules
    assert up(jpeg(), author="Іван", license="stolen").status_code == 422
    assert up(jpeg(), author="Іван", license="cc-by-4.0").status_code == 422  # open licence needs a source link
    assert up(b"not an image", author="Іван", license="own").status_code == 422
    r = up(jpeg(), author="Іван Петренко", license="own")
    assert r.status_code == 201
    p = r.json()
    assert p["is_primary"] and p["width"] == 1600 and p["height"] == 1067  # resized
    stored = client.get(p["url"])
    assert stored.status_code == 200 and stored.headers["content-type"] == "image/webp"
    assert b"SecretCamera" not in stored.content  # metadata stripped
    # the catalogue shows the primary photo with attribution
    car = client.get(f"/api/cars/{slug}").json()
    assert car["photo"]["author"] == "Іван Петренко" and car["photo"]["license"] == "Власне фото"
    p2 = up(jpeg(800, 600, exif=False), author="Wiki", license="cc-by-sa-4.0", source_url="https://commons.wikimedia.org/x").json()
    assert not p2["is_primary"]
    client.post(f"/api/admin/photos/{p2['id']}/primary", headers=h)
    assert client.get(f"/api/cars/{slug}").json()["photo"]["author"] == "Wiki"
    assert client.delete(f"/api/admin/photos/{p2['id']}", headers=h).status_code == 204
    photos = client.get(f"/api/cars/{slug}/photos").json()
    assert len(photos) == 1 and photos[0]["is_primary"]  # the remaining one is promoted
    # regular users cannot upload
    u = client.post("/api/auth/register", json={"email": "ph@example.com", "password": "secret123"}).json()["token"]
    assert client.post(f"/api/admin/cars/{slug}/photos", headers={"Authorization": f"Bearer {u}"},
                       files={"file": ("a.jpg", jpeg(), "image/jpeg")}, data={"author": "x x", "license": "own"}).status_code == 403
