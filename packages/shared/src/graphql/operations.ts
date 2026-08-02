// `bean(id:)` takes an ID! while `BeanFilter.blockedById` takes a String, so the
// same bean id has to be declared twice. `blocksInbound` is the half of "blocks"
// that `blocking` cannot see: beans whose own `blocked_by` names this one.
export const BEAN_DETAIL_QUERY = /* GraphQL */ `
  query BeanDetail($id: ID!, $idStr: String!) {
    blocksInbound: beans(filter: { blockedById: $idStr }) {
      id
      title
      type
      status
    }
    bean(id: $id) {
      id
      slug
      path
      title
      status
      type
      priority
      tags
      body
      etag
      parentId
      createdAt
      updatedAt
      blockingIds
      blockedByIds
      parent {
        id
        title
        type
        status
      }
      children {
        id
        title
        type
        status
      }
      blockedBy {
        id
        title
        type
        status
      }
    }
  }
`;

export const UPDATE_BEAN_MUTATION = /* GraphQL */ `
  mutation UpdateBean($id: ID!, $input: UpdateBeanInput!) {
    updateBean(id: $id, input: $input) {
      id
      etag
    }
  }
`;

export const CREATE_BEAN_MUTATION = /* GraphQL */ `
  mutation CreateBean($input: CreateBeanInput!) {
    createBean(input: $input) {
      id
      etag
    }
  }
`;

export const DELETE_BEAN_MUTATION = /* GraphQL */ `
  mutation DeleteBean($id: ID!) {
    deleteBean(id: $id)
  }
`;

export const SET_PARENT_MUTATION = /* GraphQL */ `
  mutation SetParent($id: ID!, $parentId: String) {
    setParent(id: $id, parentId: $parentId) {
      id
      etag
    }
  }
`;

export const ADD_BLOCKING_MUTATION = /* GraphQL */ `
  mutation AddBlocking($id: ID!, $targetId: ID!) {
    addBlocking(id: $id, targetId: $targetId) {
      id
      etag
    }
  }
`;

export const REMOVE_BLOCKING_MUTATION = /* GraphQL */ `
  mutation RemoveBlocking($id: ID!, $targetId: ID!) {
    removeBlocking(id: $id, targetId: $targetId) {
      id
      etag
    }
  }
`;

export const ADD_BLOCKED_BY_MUTATION = /* GraphQL */ `
  mutation AddBlockedBy($id: ID!, $targetId: ID!) {
    addBlockedBy(id: $id, targetId: $targetId) {
      id
      etag
    }
  }
`;

export const REMOVE_BLOCKED_BY_MUTATION = /* GraphQL */ `
  mutation RemoveBlockedBy($id: ID!, $targetId: ID!) {
    removeBlockedBy(id: $id, targetId: $targetId) {
      id
      etag
    }
  }
`;
