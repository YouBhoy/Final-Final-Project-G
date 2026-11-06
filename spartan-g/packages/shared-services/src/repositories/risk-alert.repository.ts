import { COLLECTIONS, RiskAlertDocument } from '@spartan-g/shared-types';
import { where, orderBy, limit, QueryConstraint } from '../firebase/firestore';
import { BaseRepository } from './base.repository';
import { facilitatorStudentLinkRepository } from './facilitator-student-link.repository';

class RiskAlertRepository extends BaseRepository<RiskAlertDocument> {
  subscribeAuthorized(facilitatorId:string,callback:(rows:(RiskAlertDocument&{id:string})[])=>void,onError?:(error:Error)=>void) {
    let generation=0,stopped=false,children:(()=>void)[]=[];
    const links=facilitatorStudentLinkRepository.subscribeQuery([where('facilitatorId','==',facilitatorId),where('status','==','accepted')],records=>{
      const current=++generation;children.forEach(stop=>stop());children=[];callback([]);
      const values=new Map<string,(RiskAlertDocument&{id:string})[]>();
      for(const studentId of new Set(records.map(link=>link.studentId)))children.push(this.subscribeQuery([
        where('facilitatorId','==',facilitatorId),where('studentId','==',studentId),
      ],rows=>{if(stopped||current!==generation)return;values.set(studentId,rows);callback([...values.values()].flat().sort((a,b)=>(b.createdAt?.toMillis?.()??0)-(a.createdAt?.toMillis?.()??0)));},error=>{if(!stopped&&current===generation)onError?.(error);}));
    },error=>{generation++;children.forEach(stop=>stop());children=[];callback([]);onError?.(error);});
    return()=>{stopped=true;generation++;links();children.forEach(stop=>stop());};
  }
  constructor() {
    super(COLLECTIONS.RISK_ALERTS);
  }

  async getByFacilitator(facilitatorId: string, pagination?: { limitCount?: number; startAfter?: string }) {
    // Each query is constrained to an accepted assignment; no staff-wide list.
    const links=await facilitatorStudentLinkRepository.getAcceptedLinks(facilitatorId);
    const records=new Map<string,RiskAlertDocument&{id:string}>();
    for(const studentId of new Set(links.map(link=>link.studentId))) {
      const constraints: QueryConstraint[]=[where('facilitatorId','==',facilitatorId),where('studentId','==',studentId)];
      for(const record of await this.getAll(constraints))records.set(record.id,record);
    }
    const sorted=[...records.values()].sort((a,b)=>(b.createdAt?.toMillis?.()??0)-(a.createdAt?.toMillis?.()??0));
    return pagination?.limitCount?sorted.slice(0,pagination.limitCount):sorted;
  }

  async getOpenByFacilitator(facilitatorId: string, pagination?: { limitCount?: number; startAfter?: string }) {
    // Filter only the already authorized assigned-student results.
    const records=(await this.getByFacilitator(facilitatorId)).filter(v=>v.status==='open');
    return pagination?.limitCount?records.slice(0,pagination.limitCount):records;
  }

  /** Fetch all risk alerts for a specific student (for timeline views). */
  async getByStudent(studentId: string, pagination?: { limitCount?: number; startAfter?: string }) {
    const constraints: QueryConstraint[] = [
      where('studentId', '==', studentId),
      orderBy('createdAt', 'desc'),
    ];
    if (pagination?.limitCount) {
      constraints.push(limit(pagination.limitCount));
    }
    return this.getAll(constraints);
  }
}

export const riskAlertRepository = new RiskAlertRepository();
