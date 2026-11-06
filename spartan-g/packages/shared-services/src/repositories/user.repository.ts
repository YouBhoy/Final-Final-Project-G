import { COLLECTIONS } from '@spartan-g/shared-types';
import { UserDocument } from '@spartan-g/shared-types';
import { where } from '../firebase/firestore';
import { BaseRepository } from './base.repository';
import { facilitatorStudentLinkRepository } from './facilitator-student-link.repository';

class UserRepository extends BaseRepository<UserDocument> {
  async getAssignedStudents(facilitatorId:string):Promise<(UserDocument&{id:string})[]> {
    const links=await facilitatorStudentLinkRepository.getAcceptedLinks(facilitatorId), result:(UserDocument&{id:string})[]=[];
    for(const id of new Set(links.map(link=>link.studentId))) {
      try{const user=await this.getById(id);if(user?.role==='student'&&user.isActive)result.push(user);}
      catch(error){const raw=error as {code?:string;cause?:{code?:string}};
        if(raw.code!=='permission-denied'&&raw.cause?.code!=='permission-denied')throw error;
        result.push({id,uid:id,displayName:'Assigned student',email:'',role:'student',isActive:true} as UserDocument&{id:string});
      }
    }
    return result;
  }
  constructor() {
    super(COLLECTIONS.USERS);
  }

  async getByEmail(email: string) {
    const users = await this.getAll([where('email', '==', email)]);
    return users[0] ?? null;
  }

  async getByRole(role: UserDocument['role']) {
    return this.getAll([where('role', '==', role)]);
  }

  /** Fetch all active users with a given role. The isActive filter matches
   *  the Firestore security rule condition so the query isn't rejected. */
  async getActiveByRole(role: UserDocument['role']) {
    return this.getAll([
      where('role', '==', role),
      where('isActive', '==', true),
    ]);
  }

  async setActive(uid: string, isActive: boolean) {
    return this.update(uid, { isActive } as Partial<UserDocument>);
  }

  /** Fetch all active student users, sorted in-memory by displayName to avoid composite index requirement. */
  async getAllStudents(): Promise<(UserDocument & { id: string })[]> {
    const results = await this.getAll([
      where('role', '==', 'student'),
      where('isActive', '==', true),
    ]);
    results.sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
    return results;
  }
}

export const userRepository = new UserRepository();
