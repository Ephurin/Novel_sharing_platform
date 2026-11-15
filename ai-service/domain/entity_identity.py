"""Remap exact identity references without altering quoted narrative text."""
def remap_identity(value, source_id: str, target_id: str):
    if isinstance(value, str):
        return target_id if value == source_id else value
    if isinstance(value, dict):
        return {target_id if key == source_id else key: remap_identity(item, source_id, target_id)
                for key, item in value.items()}
    if isinstance(value, list):
        return [remap_identity(item, source_id, target_id) for item in value]
    return value
