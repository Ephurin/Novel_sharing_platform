"""
Style Service
=============
Maps a mood keyword to a prompt directive that shapes the LLM's creative tone.
"""

MOOD_DIRECTIVES = {
    "romantic": (
        "Hay tao ra cac goi y mang sac thai LANG MAN. "
        "Tang cuong cac yeu to tinh cam, su diu dang, cam xuc sau sac giua cac nhan vat. "
        "Giu giong van mem mai, tho mong nhung van hop ly voi boi canh truyen."
    ),
    "tragic": (
        "Hay tao ra cac goi y mang sac thai BI KICH. "
        "Tang cuong su cang thang, dau kho, mat mat. "
        "Goi y nhung tinh tiet co thiet hai lon, hy sinh hoac phan boi. "
        "Giong van tram buon, nang ne."
    ),
    "comedic": (
        "Hay tao ra cac goi y mang sac thai HAI HUOC. "
        "Them cac tinh huong bat ngo, ngo ngan, lam nguoi doc bat cuoi. "
        "Giu giong van nhieu nang luong va vui ve."
    ),
    "dark": (
        "Hay tao ra cac goi y mang sac thai TAM TOI. "
        "Tang cuong su de doa, nguy hiem, am muu. "
        "Goi y nhung tinh tiet co su ac doc, thu doan, hoac luc luong hac am. "
        "Giong van lanh lung, dang so."
    ),
    "neutral": "",
}


def build_mood_directive(mood: str) -> str:
    """Return a Vietnamese prompt fragment matching the requested mood.

    Args:
        mood: One of 'romantic', 'tragic', 'comedic', 'dark', 'neutral'.

    Returns:
        A prompt fragment string. Empty string for 'neutral' or unknown moods.
    """
    return MOOD_DIRECTIVES.get(mood.lower().strip(), "")
