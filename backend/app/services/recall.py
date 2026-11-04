from typing import List, Dict, Any
from sqlalchemy.orm import Session


def recall_for_fact_version(db: Session, fact_version_id: int) -> List[Dict[str, Any]]:
    return []
