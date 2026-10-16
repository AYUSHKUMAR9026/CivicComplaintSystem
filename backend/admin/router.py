from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, case, nullslast
from fastapi import APIRouter, Depends, HTTPException, status, Query

from db.session import get_db
from models import (
    Complaint, Category, Department, User, Citizen, Admin,
    ComplaintStatus, Vote, ComplaintStatusHistory
)
from schemas import (
    ComplaintResponse, ComplaintListResponse, CategoryCreate, CategoryResponse,
    DepartmentCreate, DepartmentResponse, AssessmentOverrideRequest, ComplainantResponse
)
from common.auth import get_current_active_user, require_admin, require_department
from complaint.router import _attach_applicant_details_to_complaint
from common.exceptions import NotFoundException, ValidationException, ConflictException

router = APIRouter(prefix="/api/admin", tags=["admin"])


# Dashboard KPIs
@router.get("/dashboard/stats")
async def get_dashboard_stats(
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get dashboard KPI statistics"""
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    
    # Total open complaints
    open_statuses = [ComplaintStatus.PENDING, ComplaintStatus.WORKING]
    open_count = db.query(Complaint).filter(Complaint.status.in_(open_statuses)).count()
    
    # Resolved this week
    resolved_this_week = db.query(Complaint).filter(
        Complaint.status == ComplaintStatus.COMPLETED,
        Complaint.resolved_at >= week_ago
    ).count()
    
    # Avg resolution time (days)
    resolved_complaints = db.query(Complaint).filter(
        Complaint.status == ComplaintStatus.COMPLETED,
        Complaint.resolved_at.isnot(None)
    ).all()
    
    avg_resolution_days = 0
    if resolved_complaints:
        total_days = sum((c.resolved_at - c.created_at).total_seconds() / 86400 for c in resolved_complaints)
        avg_resolution_days = round(total_days / len(resolved_complaints), 1)
    
    # By category
    by_category = db.query(
        Category.name,
        func.count(Complaint.id)
    ).join(Complaint).group_by(Category.name).all()
    
    # By status
    by_status = db.query(
        Complaint.status,
        func.count(Complaint.id)
    ).group_by(Complaint.status).all()
    
    # By department
    by_department = db.query(
        Department.display_name,
        func.count(Complaint.id)
    ).outerjoin(Complaint).group_by(Department.display_name).all()

    # By Priority Level
    by_priority = db.query(
        Complaint.priority_level,
        func.count(Complaint.id)
    ).group_by(Complaint.priority_level).all()

    # Needs Review Count & Critical Count
    needs_review_count = db.query(Complaint).filter(Complaint.needs_human_review == True).count()
    critical_count = db.query(Complaint).filter(Complaint.priority_level == "critical").count()
    
    return {
        "open_complaints": open_count,
        "resolved_this_week": resolved_this_week,
        "avg_resolution_days": avg_resolution_days,
        "by_category": [{"category": c, "count": n} for c, n in by_category],
        "by_status": [{"status": s.value, "count": n} for s, n in by_status],
        "by_department": [{"department": d or "Unassigned", "count": n} for d, n in by_department],
        "by_priority": [{"priority": p or "unassessed", "count": n} for p, n in by_priority],
        "needs_review_count": needs_review_count,
        "critical_count": critical_count,
    }


@router.get("/complaints", response_model=ComplaintListResponse)
async def list_all_complaints(
    page: int = 1,
    page_size: int = 50,
    status_filter: Optional[ComplaintStatus] = None,
    category_id: Optional[int] = None,
    department_id: Optional[str] = None,
    priority_level: Optional[str] = None,
    needs_human_review: Optional[bool] = None,
    search: Optional[str] = None,
    sort_by: str = "priority_score",
    sort_order: str = "desc",
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """List all complaints with advanced filtering and sorting"""
    query = db.query(Complaint)
    
    if status_filter:
        query = query.filter(Complaint.status == status_filter)
    if category_id:
        query = query.filter(Complaint.category_id == category_id)
    if department_id:
        dept_val = str(department_id).strip().lower()
        if dept_val == "unassigned":
            query = query.filter(Complaint.department_id.is_(None))
        elif dept_val == "assigned":
            query = query.filter(Complaint.department_id.isnot(None))
        elif dept_val.isdigit():
            query = query.filter(Complaint.department_id == int(dept_val))
    if priority_level:
        query = query.filter(Complaint.priority_level == priority_level.lower())
    if needs_human_review is not None:
        query = query.filter(Complaint.needs_human_review == needs_human_review)
    if search:
        query = query.filter(Complaint.description.ilike(f"%{search}%"))
    
    # Sorting
    if sort_by == "priority_score":
        sort_column = Complaint.priority_score
    elif sort_by == "severity_score":
        sort_column = Complaint.severity_score
    elif sort_by == "urgency_score":
        sort_column = Complaint.urgency_score
    elif sort_by == "upvote_count":
        sort_column = Complaint.upvote_count
    elif sort_by == "created_at":
        sort_column = Complaint.created_at
    else:
        sort_column = Complaint.priority_score

    if sort_order == "desc":
        query = query.order_by(nullslast(desc(sort_column)))
    else:
        query = query.order_by(sort_column)
    
    total = query.count()
    complaints = query.offset((page - 1) * page_size).limit(page_size).all()
    for c in complaints:
        _attach_applicant_details_to_complaint(c, current_user, db)
    
    return ComplaintListResponse(
        complaints=complaints,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/complaints/{complaint_id}", response_model=ComplaintResponse)
async def get_complaint_detail(
    complaint_id: int,
    current_user = Depends(require_department),
    db: Session = Depends(get_db)
):
    """Get full complaint detail with applicant and history for Admin and Department staff"""
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise NotFoundException("Complaint not found")
    _attach_applicant_details_to_complaint(complaint, current_user, db)
    return complaint


@router.get("/complaints/{complaint_id}/applicant", response_model=ComplainantResponse)
async def get_admin_complaint_applicant(
    complaint_id: int,
    current_user = Depends(require_department),
    db: Session = Depends(get_db)
):
    """Get citizen applicant details for a complaint (Admin and Department staff)"""
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise NotFoundException("Complaint not found")
        
    citizen_obj = complaint.citizen or db.query(Citizen).filter(Citizen.id == complaint.citizen_id).first()
    if not citizen_obj:
        raise NotFoundException("Applicant profile not found")
        
    cit_user = citizen_obj.user or db.query(User).filter(User.id == citizen_obj.user_id).first()
    return ComplainantResponse(
        id=citizen_obj.id,
        user_id=citizen_obj.user_id,
        full_name=cit_user.full_name if cit_user else "Citizen",
        email=cit_user.email if cit_user else "",
        phone=cit_user.phone if cit_user else None,
        address=citizen_obj.address,
        latitude=citizen_obj.latitude,
        longitude=citizen_obj.longitude,
        registered_at=cit_user.created_at if cit_user else None,
        preferred_notification_channels=citizen_obj.preferred_notification_channels
    )


@router.put("/complaints/{complaint_id}/assessment", response_model=ComplaintResponse)
async def update_complaint_assessment(
    complaint_id: int,
    override: AssessmentOverrideRequest,
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Admin override or verification of complaint priority assessment"""
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise NotFoundException("Complaint not found")
        
    from complaint.assessment import calculate_priority_score
    
    if override.severity_score is not None:
        complaint.severity_score = override.severity_score
    if override.impact_score is not None:
        complaint.impact_score = override.impact_score
    if override.urgency_score is not None:
        complaint.urgency_score = override.urgency_score
    if override.is_safety_escalated is not None:
        complaint.is_safety_escalated = override.is_safety_escalated
    if override.needs_human_review is not None:
        complaint.needs_human_review = override.needs_human_review
    if override.admin_notes:
        complaint.admin_override_reason = override.admin_notes
        
    complaint.admin_override = True
    complaint.assessment_status = "completed"
    
    # Recalculate priority score and level
    sev = complaint.severity_score if complaint.severity_score is not None else 40
    imp = complaint.impact_score if complaint.impact_score is not None else 35
    urg = complaint.urgency_score if complaint.urgency_score is not None else 35
    
    score, level = calculate_priority_score(
        severity=sev,
        impact=imp,
        urgency=urg,
        upvote_count=complaint.upvote_count,
        is_safety_escalated=complaint.is_safety_escalated
    )
    complaint.priority_score = score
    complaint.priority_level = level
    complaint.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(complaint)
    return complaint


@router.post("/complaints/{complaint_id}/reassess", response_model=ComplaintResponse)
async def reassess_complaint(
    complaint_id: int,
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Trigger re-assessment using LLM priority service"""
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise NotFoundException("Complaint not found")
        
    from complaint.assessment import assess_complaint
    category = db.query(Category).filter(Category.id == complaint.category_id).first()
    cat_name = category.name if category else "general"
    cat_display = category.display_name if category else "General Issue"
    
    assessment = await assess_complaint(
        category_name=cat_name,
        category_display=cat_display,
        description=complaint.description,
        location=complaint.location,
        latitude=complaint.latitude,
        longitude=complaint.longitude,
        upvote_count=complaint.upvote_count
    )
    
    complaint.severity_score = assessment.severity_score
    complaint.impact_score = assessment.impact_score
    complaint.urgency_score = assessment.urgency_score
    complaint.priority_score = assessment.priority_score
    complaint.priority_level = assessment.priority_level
    complaint.assessment_status = assessment.assessment_status
    complaint.assessment_reason = assessment.assessment_reason
    complaint.assessment_confidence = assessment.assessment_confidence
    complaint.missing_information = assessment.missing_information
    complaint.needs_human_review = assessment.needs_human_review
    complaint.is_safety_escalated = assessment.is_safety_escalated
    complaint.ai_severity_score = assessment.ai_severity_score
    complaint.ai_impact_score = assessment.ai_impact_score
    complaint.ai_urgency_score = assessment.ai_urgency_score
    complaint.ai_reason = assessment.ai_reason
    complaint.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(complaint)
    return complaint


@router.put("/complaints/{complaint_id}/assign")
async def assign_complaint(
    complaint_id: int,
    department_id: int,
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Assign complaint to department"""
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise NotFoundException("Complaint not found")
    
    department = db.query(Department).filter(Department.id == department_id).first()
    if not department:
        raise NotFoundException("Department not found")
    
    complaint.department_id = department_id
    if not complaint.assigned_at:
        complaint.assigned_at = datetime.utcnow()
    complaint.updated_at = datetime.utcnow()
    
    # Record history
    history = ComplaintStatusHistory(
        complaint_id=complaint.id,
        previous_status=complaint.status,
        new_status=complaint.status,
        changed_by=current_user.id,
        notes=f"Assigned to {department.display_name}"
    )
    db.add(history)
    
    db.commit()
    db.refresh(complaint)
    
    return {"message": "Complaint assigned successfully", "complaint": ComplaintResponse.model_validate(complaint)}


# Category management
@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    category_data: CategoryCreate,
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Create new complaint category"""
    category = Category(**category_data.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/categories", response_model=List[CategoryResponse])
async def list_categories(
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """List all categories"""
    # autoescape treats the underscore literally; a bare 'pot_%' LIKE pattern
    # also matched the real "pothole" category, hiding it from this list.
    return db.query(Category).filter(
        Category.is_active == True,
        ~Category.name.startswith('pot_', autoescape=True)
    ).order_by(Category.id).all()


@router.put("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: int,
    category_data: CategoryCreate,
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Update category"""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise NotFoundException("Category not found")
    
    for key, value in category_data.model_dump().items():
        setattr(category, key, value)
    
    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: int,
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Deactivate category"""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise NotFoundException("Category not found")
    
    category.is_active = False
    db.commit()
    return {"message": "Category deactivated"}


# Department management
@router.post("/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    dept_data: DepartmentCreate,
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Create new department"""
    existing = db.query(Department).filter(
        (Department.name == dept_data.name) | (Department.display_name == dept_data.display_name)
    ).first()
    if existing:
        raise ConflictException("Department with this name or display name already exists")
    department = Department(**dept_data.model_dump())
    db.add(department)
    db.commit()
    db.refresh(department)
    return department


@router.get("/departments", response_model=List[DepartmentResponse])
async def list_departments(
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """List all departments"""
    return db.query(Department).filter(Department.is_active == True).all()


# Reports
@router.get("/reports/resolution-time-trend")
async def get_resolution_time_trend(
    days: int = 30,
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get resolution time trend over specified days"""
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Daily resolution counts and avg time
    results = db.query(
        func.date(Complaint.resolved_at).label('date'),
        func.count(Complaint.id).label('count'),
        func.avg(
            func.extract('epoch', Complaint.resolved_at - Complaint.created_at) / 86400
        ).label('avg_days')
    ).filter(
        Complaint.status == ComplaintStatus.COMPLETED,
        Complaint.resolved_at >= start_date
    ).group_by(func.date(Complaint.resolved_at)).all()
    
    return [
        {"date": str(r.date), "resolved_count": r.count, "avg_resolution_days": round(r.avg_days or 0, 1)}
        for r in results
    ]


@router.get("/reports/complaints-by-category")
async def get_complaints_by_category(
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get complaint distribution by category"""
    results = db.query(
        Category.name,
        Category.display_name,
        func.count(Complaint.id)
    ).outerjoin(Complaint).group_by(Category.id).all()
    
    return [
        {"category": c, "display_name": d, "count": n}
        for c, d, n in results
    ]


@router.get("/reports/complaints-by-department")
async def get_complaints_by_department(
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get complaint distribution by department"""
    results = db.query(
        Department.display_name,
        func.count(Complaint.id)
    ).outerjoin(Complaint).group_by(Department.id).all()
    
    return [
        {"department": d or "Unassigned", "count": n}
        for d, n in results
    ]


@router.get("/notifications/emails")
async def get_recent_email_notifications(
    current_user = Depends(require_admin)
):
    """Get log of recent email notifications sent to citizens"""
    from common.email_service import SENT_EMAILS_LOG
    return {"emails": SENT_EMAILS_LOG[-50:]}


@router.delete("/complaints/{complaint_id}")
async def delete_complaint_admin(
    complaint_id: int,
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Delete a complaint from the admin panel"""
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise NotFoundException("Complaint not found")
        
    db.query(Vote).filter(Vote.complaint_id == complaint_id).delete(synchronize_session=False)
    db.query(ComplaintStatusHistory).filter(ComplaintStatusHistory.complaint_id == complaint_id).delete(synchronize_session=False)
    db.delete(complaint)
    db.commit()
    return {"message": f"Complaint #{complaint_id} successfully deleted", "id": complaint_id}