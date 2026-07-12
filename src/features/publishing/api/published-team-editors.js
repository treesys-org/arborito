/** Count invited collaborators with editor role on the active tree. */
export function countTeamEditors(store) {
    const roles = store?.state?.treeCollaboratorRoles;
    if (!roles || typeof roles !== 'object') return 0;
    return Object.values(roles).filter((r) => String(r) === 'editor').length;
}

export function hasOtherTeamEditors(store) {
    return countTeamEditors(store) > 0;
}
