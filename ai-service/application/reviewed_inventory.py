"""Identity IDs are authoritative; display names and aliases are many-to-many labels."""
from collections import defaultdict

from domain.errors import OptimisticLockError


class ReviewedInventory:
    def __init__(self, audit):
        if audit.get('identity_inventory_version') != 2:
            raise OptimisticLockError('Reconfirm the entity review to upgrade its identity inventory')
        self.entities = {}
        self.labels = defaultdict(set)
        for entity in audit['entities']:
            identity = entity.get('entity_id')
            if not identity or identity in self.entities:
                raise ValueError('Frozen inventory must contain unique explicit identity IDs')
            self.entities[identity] = entity
            self.labels[entity['phrase'].casefold()].add(identity)
        for alias in audit['aliases']:
            if alias['entity_id'] not in self.entities:
                raise ValueError('Alias target is outside the reviewed inventory')
            self.labels[alias['alias'].casefold()].add(alias['entity_id'])
        self.items = [dict(entity_id=identity, name=e['phrase'], entity_type=e['entity'],
            canonical_entity_id=e['canonical_entity_id'], occurrences=e['occurrences'])
            for identity, e in self.entities.items()]

    def __bool__(self):
        return bool(self.entities)

    def resolve(self, reference):
        if not isinstance(reference, str):
            raise ValueError('Identity reference must be a string')
        if reference in self.entities:
            return reference
        matches = self.labels.get(reference.casefold(), set())
        if len(matches) > 1:
            raise OptimisticLockError('Ambiguous reviewed name/alias; use an exact identity ID')
        if len(matches) != 1:
            raise ValueError('Downstream identity is outside the reviewed inventory')
        return next(iter(matches))
